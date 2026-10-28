import { existsSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { ImageManifest } from '../src/image-state.js';

import { readJsonFile, writeJsonFile } from '../src/files.js';
import { resolveImageEncoding } from '../src/image-encoding.js';
import { imageManifestVersion, listImageBuilds, writeImageManifest } from '../src/image-state.js';
import { prepareImageSweep } from '../src/image-sweep.js';
import { UserError } from '../src/user-error.js';

let root: string;
let renditionsPath: string;
let keysPath: string;
let writtenAt: number;

async function writeBuild(buildId: string, names: ReadonlyArray<string>) {
	await writeImageManifest(root, {
		buildId,
		encoding: resolveImageEncoding(),
		limitInputPixels: 268_402_689,
		mediaPath: path.join(root, 'media'),
		openGraphCards: {},
		renditions: Object.fromEntries(names.map((name) => [name, 'source.jpg'])),
		version: imageManifestVersion,
	} satisfies ImageManifest);

	writtenAt += 60_000;

	const time = new Date(writtenAt);

	await fs.utimes(path.join(root, 'manifests', `${buildId}.json.gz`), time, time);
}

async function writeRenditions(names: ReadonlyArray<string>) {
	for (const name of names) {
		const filePath = path.join(renditionsPath, name);

		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, name);
	}
}

async function listFiles() {
	const entries = await fs.readdir(renditionsPath, { recursive: true, withFileTypes: true });

	return sortNames(
		entries
			.filter((entry) => entry.isFile())
			.map((entry) => path.relative(renditionsPath, path.join(entry.parentPath, entry.name))),
	);
}

async function listBuildIds() {
	const builds = await listImageBuilds(root);

	return builds.map((build) => build.buildId);
}

function sortNames(names: Iterable<string>) {
	return [...names].toSorted((first, second) => first.localeCompare(second));
}

function getNames(files: ReadonlyArray<{ name: string }>) {
	return sortNames(files.map((file) => file.name));
}

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(tmpdir(), 'image-sweep-'));
	renditionsPath = path.join(root, 'renditions');
	keysPath = `${renditionsPath}-keys.json`;
	writtenAt = Date.parse('2026-01-01T00:00:00Z');
});

afterEach(async () => {
	await fs.rm(root, { force: true, recursive: true });
});

describe('prepareImageSweep', () => {
	test('plans deleting what no kept build references, keeping the newest build unasked', async () => {
		await writeBuild('old', ['a-450.jpg', 'b-450.jpg']);
		await writeBuild('live', ['b-450.jpg', 'c-450.jpg']);
		await writeBuild('newest', ['c-450.jpg', 'd-450.jpg']);
		await writeRenditions(['a-450.jpg', 'b-450.jpg', 'c-450.jpg', 'd-450.jpg', 'e-450.jpg']);

		const sweep = await prepareImageSweep({ cachePath: root, keep: ['live'] });

		expect(getNames(sweep.deletions)).toStrictEqual(['a-450.jpg', 'e-450.jpg']);
		expect(sweep.deletions[0]?.size).toBe('a-450.jpg'.length);
		expect(sortNames(sweep.keep)).toStrictEqual(['b-450.jpg', 'c-450.jpg', 'd-450.jpg']);
		expect(sweep.total).toBe(5);
		expect(await listFiles()).toHaveLength(5);

		const result = await sweep.run();

		expect(getNames(result.deletions)).toStrictEqual(['a-450.jpg', 'e-450.jpg']);
		expect(result.droppedBuilds).toStrictEqual(['old']);
		expect(await listFiles()).toStrictEqual(['b-450.jpg', 'c-450.jpg', 'd-450.jpg']);
		expect(await listBuildIds()).toStrictEqual(['newest', 'live']);
	});

	test('an unknown build id refuses the sweep', async () => {
		await writeBuild('live', ['a-450.jpg']);

		await expect(prepareImageSweep({ cachePath: root, keep: ['missing'] })).rejects.toThrow(
			/No image manifest for build missing/,
		);
	});

	test('a cache with no builds refuses rather than deleting everything', async () => {
		await writeRenditions(['a-450.jpg']);

		await expect(prepareImageSweep({ cachePath: root, keep: [] })).rejects.toThrow(UserError);
	});

	test('a build that lands between prepare and run keeps its renditions', async () => {
		await writeBuild('live', ['a-450.jpg']);
		await writeRenditions(['a-450.jpg', 'b-450.jpg', 'c-450.jpg']);

		const sweep = await prepareImageSweep({ cachePath: root, keep: ['live'] });

		await writeBuild('newer', ['a-450.jpg', 'b-450.jpg']);

		const result = await sweep.run();

		expect(getNames(result.deletions)).toStrictEqual(['c-450.jpg']);
		expect(sortNames(result.keep)).toStrictEqual(['a-450.jpg', 'b-450.jpg']);
		expect(await listFiles()).toStrictEqual(['a-450.jpg', 'b-450.jpg']);
		expect(await listBuildIds()).toStrictEqual(['newer', 'live']);
	});

	test('temporary files, emptied directories and stale key records go', async () => {
		await writeBuild('live', ['kept/a-450.jpg']);
		await writeRenditions(['kept/a-450.jpg', 'kept/a-450.jpg.tmp', 'gone/deep/b-450.jpg']);
		await writeJsonFile(keysPath, {
			files: {
				'c-450.jpg': { key: 'c' },
				'gone/deep/b-450.jpg': { key: 'b' },
				'kept/a-450.jpg': { key: 'a' },
			},
		});

		const sweep = await prepareImageSweep({ cachePath: root, keep: [] });

		await sweep.run();

		expect(await listFiles()).toStrictEqual(['kept/a-450.jpg']);
		expect(existsSync(path.join(renditionsPath, 'gone'))).toBe(false);
		expect(await readJsonFile(keysPath)).toStrictEqual({
			files: { 'kept/a-450.jpg': { key: 'a' } },
		});
	});

	test('a missing renditions directory sweeps nothing', async () => {
		await writeBuild('live', ['a-450.jpg']);

		const sweep = await prepareImageSweep({ cachePath: root, keep: [] });

		expect(sweep.total).toBe(0);
		const result = await sweep.run();

		expect(result.deletions).toStrictEqual([]);
	});
});
