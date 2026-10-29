import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { FileRecord } from '../src/file-store.js';
import type { ImageManifest } from '../src/image-state.js';
import type { ImageSweepOptions } from '../src/image-sweep.js';

import { readFileRecords, writeFileRecords } from '../src/file-store.js';
import { resolveImageEncoding } from '../src/image-encoding.js';
import { imageManifestVersion, listImageBuilds, writeImageManifest } from '../src/image-state.js';
import { prepareImageSweep } from '../src/image-sweep.js';
import { UserError } from '../src/user-error.js';

const dayMilliseconds = 24 * 60 * 60 * 1000;

let root: string;
let mediaPath: string;
let renditionsPath: string;
let cardsPath: string;

async function setBuildAge(buildId: string, days: number) {
	const time = new Date(Date.now() - days * dayMilliseconds);

	await fs.utimes(path.join(root, 'manifests', `${buildId}.json.gz`), time, time);
}

async function writeBuild(
	buildId: string,
	days: number,
	{
		cards = [],
		renditions = [],
	}: { cards?: ReadonlyArray<string>; renditions?: ReadonlyArray<string> | Record<string, string> },
) {
	await writeImageManifest(root, {
		buildId,
		cards: Object.fromEntries(cards.map((name) => [name, { input: { title: name } }])),
		encoding: resolveImageEncoding(),
		keepIccProfile: false,
		limitInputPixels: 268_402_689,
		mediaPath,
		renditions: Array.isArray(renditions)
			? Object.fromEntries(renditions.map((name) => [name, 'source.jpg']))
			: renditions,
		version: imageManifestVersion,
	} satisfies ImageManifest);
	await setBuildAge(buildId, days);
}

async function writeFiles(directory: string, records: Record<string, Omit<FileRecord, 'key'>>) {
	for (const name of Object.keys(records)) {
		const filePath = path.join(directory, name);

		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, name);
	}

	await writeFileRecords(
		directory,
		new Map(Object.entries(records).map(([name, record]) => [name, { key: name, ...record }])),
	);
}

async function writeSource(sourcePath: string, background: string) {
	const filePath = path.join(mediaPath, sourcePath);

	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await sharp({ create: { background, channels: 3, height: 600, width: 900 } })
		.jpeg()
		.toFile(filePath);

	return createHash('sha256')
		.update(await fs.readFile(filePath))
		.digest('hex');
}

async function listFiles(directory: string) {
	if (!existsSync(directory)) return [];

	const entries = await fs.readdir(directory, { recursive: true, withFileTypes: true });

	return sortNames(
		entries
			.filter((entry) => entry.isFile())
			.map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name))),
	);
}

async function listBuildIds() {
	const builds = await listImageBuilds(root);

	return sortNames(builds.map((build) => build.buildId));
}

function sortNames(names: Iterable<string>) {
	return [...names].toSorted((first, second) => first.localeCompare(second));
}

function getNames(files: ReadonlyArray<{ name: string }>) {
	return sortNames(files.map((file) => file.name));
}

function sweep(options: Partial<ImageSweepOptions> = {}) {
	return prepareImageSweep({
		live: 'live',
		retentionDays: { cards: 365, renditions: 7 },
		storePath: root,
		...options,
	});
}

async function runSweep(options: Partial<ImageSweepOptions> = {}) {
	const prepared = await sweep(options);

	return prepared.run();
}

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(tmpdir(), 'image-sweep-'));
	mediaPath = path.join(root, 'media');
	renditionsPath = path.join(root, 'renditions');
	cardsPath = path.join(root, 'cards');
});

afterEach(async () => {
	await fs.rm(root, { force: true, recursive: true });
});

describe('prepareImageSweep', () => {
	test('renditions and cards each keep their own window', async () => {
		await writeBuild('stale', 400, { cards: ['stale.jpg'], renditions: ['stale-450.jpg'] });
		await writeBuild('old', 30, { cards: ['old.jpg'], renditions: ['old-450.jpg'] });
		await writeBuild('recent', 3, { renditions: ['recent-450.jpg'] });
		await writeBuild('live', 0, { cards: ['live.jpg'], renditions: ['live-450.jpg'] });
		await writeFiles(renditionsPath, {
			'live-450.jpg': {},
			'old-450.jpg': {},
			'recent-450.jpg': {},
			'stale-450.jpg': {},
		});
		await writeFiles(cardsPath, { 'live.jpg': {}, 'old.jpg': {}, 'stale.jpg': {} });
		await fs.writeFile(path.join(renditionsPath, 'orphan-450.jpg'), 'orphan');

		const prepared = await sweep();

		expect(getNames(prepared.renditions.deletions)).toStrictEqual([
			'old-450.jpg',
			'orphan-450.jpg',
			'stale-450.jpg',
		]);
		expect(prepared.renditions.deletions[0]?.size).toBe('old-450.jpg'.length);
		expect(prepared.renditions.total).toBe(5);
		expect(getNames(prepared.cards.deletions)).toStrictEqual(['stale.jpg']);
		expect(await listFiles(renditionsPath)).toHaveLength(5);

		const result = await prepared.run();

		expect(getNames(result.renditions.deletions)).toStrictEqual([
			'old-450.jpg',
			'orphan-450.jpg',
			'stale-450.jpg',
		]);
		expect(getNames(result.cards.deletions)).toStrictEqual(['stale.jpg']);
		expect(await listFiles(renditionsPath)).toStrictEqual(['live-450.jpg', 'recent-450.jpg']);
		expect(await listFiles(cardsPath)).toStrictEqual(['live.jpg', 'old.jpg']);
		expect(sortNames(result.droppedBuilds)).toStrictEqual(['old', 'recent', 'stale']);
		expect(await listBuildIds()).toStrictEqual(['live']);
	});

	test('a name keeps the age of the newest build that named it once the manifests go', async () => {
		await writeBuild('older', 10, { renditions: ['a-450.jpg'] });
		await writeBuild('newer', 3, { renditions: ['a-450.jpg'] });
		await writeBuild('live', 0, { renditions: ['b-450.jpg'] });
		await writeFiles(renditionsPath, { 'a-450.jpg': {}, 'b-450.jpg': {} });

		const first = await runSweep();

		expect(first.renditions.deletions).toStrictEqual([]);
		expect(await listBuildIds()).toStrictEqual(['live']);

		const kept = await sweep({ retentionDays: { cards: 365, renditions: 4 } });

		expect(kept.renditions.deletions).toStrictEqual([]);

		const expired = await sweep({ retentionDays: { cards: 365, renditions: 2 } });

		expect(getNames(expired.renditions.deletions)).toStrictEqual(['a-450.jpg']);
	});

	test('live, previous and newest builds keep their names past the window', async () => {
		await writeBuild('gone', 40, { cards: ['gone.jpg'], renditions: ['gone-450.jpg'] });
		await writeBuild('previous', 30, { cards: ['previous.jpg'], renditions: ['previous-450.jpg'] });
		await writeBuild('live', 20, { cards: ['live.jpg'], renditions: ['live-450.jpg'] });
		await writeBuild('newest', 10, { cards: ['newest.jpg'], renditions: ['newest-450.jpg'] });
		await writeFiles(renditionsPath, {
			'gone-450.jpg': {},
			'live-450.jpg': {},
			'newest-450.jpg': {},
			'previous-450.jpg': {},
		});
		await writeFiles(cardsPath, {
			'gone.jpg': {},
			'live.jpg': {},
			'newest.jpg': {},
			'previous.jpg': {},
		});

		const result = await runSweep({
			previous: 'previous',
			retentionDays: { cards: 5, renditions: 5 },
		});

		expect(getNames(result.renditions.deletions)).toStrictEqual(['gone-450.jpg']);
		expect(getNames(result.cards.deletions)).toStrictEqual(['gone.jpg']);
		expect(await listBuildIds()).toStrictEqual(['live', 'newest', 'previous']);
	});

	test('a file of unknown age starts its window at the first sweep', async () => {
		await writeBuild('live', 0, { renditions: ['live-450.jpg'] });
		await writeFiles(renditionsPath, { 'live-450.jpg': {}, 'unnamed-450.jpg': {} });
		await writeFiles(cardsPath, { 'unnamed.jpg': {} });

		const result = await runSweep();
		const renditionRecords = await readFileRecords(renditionsPath);
		const cardRecords = await readFileRecords(cardsPath);

		expect(result.renditions.deletions).toStrictEqual([]);
		expect(result.cards.deletions).toStrictEqual([]);
		expect(renditionRecords.get('unnamed-450.jpg')?.namedAt).toBeTypeOf('string');
		expect(cardRecords.get('unnamed.jpg')?.namedAt).toBeTypeOf('string');
	});

	test('an unknown live or previous build refuses the sweep', async () => {
		await writeBuild('live', 0, { renditions: ['a-450.jpg'] });

		await expect(sweep({ live: 'missing' })).rejects.toThrow(/No image manifest for build missing/);
		await expect(sweep({ previous: 'missing' })).rejects.toThrow(
			/No image manifest for build missing/,
		);
	});

	test('a store with no builds refuses rather than deleting everything', async () => {
		await writeFiles(renditionsPath, { 'a-450.jpg': {} });

		await expect(sweep()).rejects.toThrow(UserError);
	});

	test('a kept build from an older manifest version still sweeps', async () => {
		const previousPath = path.join(root, 'manifests', 'previous.json.gz');

		await fs.mkdir(path.dirname(previousPath), { recursive: true });
		await fs.writeFile(
			previousPath,
			gzipSync(
				JSON.stringify({
					mediaPath,
					openGraphCards: {},
					renditions: { 'a-450.jpg': 'source.jpg' },
					version: 6,
				}),
			),
		);
		await setBuildAge('previous', 30);
		await writeBuild('live', 0, { renditions: ['b-450.jpg'] });
		await writeFiles(renditionsPath, { 'a-450.jpg': {}, 'b-450.jpg': {} });
		await fs.writeFile(path.join(renditionsPath, 'c-450.jpg'), 'c');

		const prepared = await sweep({ previous: 'previous' });

		expect(getNames(prepared.renditions.deletions)).toStrictEqual(['c-450.jpg']);
	});

	test('a build that lands between prepare and run keeps its names', async () => {
		await writeBuild('live', 1, { renditions: ['a-450.jpg'] });
		await writeFiles(renditionsPath, { 'a-450.jpg': {} });
		await fs.writeFile(path.join(renditionsPath, 'b-450.jpg'), 'b');
		await fs.writeFile(path.join(renditionsPath, 'c-450.jpg'), 'c');

		const prepared = await sweep();

		await writeBuild('newer', 0, { renditions: ['a-450.jpg', 'b-450.jpg'] });

		const result = await prepared.run();

		expect(getNames(result.renditions.deletions)).toStrictEqual(['c-450.jpg']);
		expect(await listFiles(renditionsPath)).toStrictEqual(['a-450.jpg', 'b-450.jpg']);
		expect(await listBuildIds()).toStrictEqual(['live', 'newer']);
	});

	test('temporary files, emptied directories and records of missing files go', async () => {
		await writeBuild('live', 0, { renditions: ['kept/a-450.jpg'] });
		await writeFiles(renditionsPath, { 'gone/deep/b-450.jpg': {}, 'kept/a-450.jpg': {} });
		await fs.writeFile(path.join(renditionsPath, 'kept/a-450.jpg.tmp'), 'partial');
		await fs.rm(path.join(renditionsPath, 'gone/deep/b-450.jpg'));

		await runSweep();

		expect(await listFiles(renditionsPath)).toStrictEqual(['kept/a-450.jpg']);
		expect(existsSync(path.join(renditionsPath, 'gone'))).toBe(false);
		const records = await readFileRecords(renditionsPath);

		expect([...records.keys()]).toStrictEqual(['kept/a-450.jpg']);
	});

	test('missing directories sweep nothing and record nothing', async () => {
		await writeBuild('live', 0, { renditions: ['a-450.jpg'] });

		const result = await runSweep();

		expect(result.renditions).toMatchObject({ deletions: [], total: 0 });
		expect(result.cards).toMatchObject({ deletions: [], total: 0 });
		expect(existsSync(`${renditionsPath}-keys.json`)).toBe(false);
		expect(existsSync(`${cardsPath}-keys.json`)).toBe(false);
	});
});

describe('superseded renditions', () => {
	let digests: Record<string, string>;

	beforeEach(async () => {
		digests = {
			'kept.jpg': await writeSource('kept.jpg', '#336699'),
			'moved-new.jpg': await writeSource('moved-new.jpg', '#669933'),
			'moved-old.jpg': await writeSource('moved-old.jpg', '#993366'),
			'replaced.jpg': await writeSource('replaced.jpg', '#cc9933'),
		};
	});

	function sourceOf(sourcePath: string, digest = digests[sourcePath] ?? '') {
		return { source: { digest, path: sourcePath } };
	}

	test('go whatever the window when their source is gone, replaced or moved', async () => {
		await writeBuild('previous', 1, {
			renditions: { 'deleted-450.jpg': 'deleted.jpg', 'kept-900.jpg': 'kept.jpg' },
		});
		await writeBuild('live', 0, {
			renditions: { 'kept-450.jpg': 'kept.jpg', 'moved-450.jpg': 'moved-new.jpg' },
		});
		await writeFiles(renditionsPath, {
			'deleted-450.jpg': sourceOf('deleted.jpg', 'gone'),
			'kept-450.jpg': sourceOf('kept.jpg'),
			'kept-900.jpg': sourceOf('kept.jpg'),
			'moved-450.jpg': sourceOf('moved-new.jpg'),
			'moved-900.jpg': sourceOf('moved-old.jpg'),
			'replaced-450.jpg': sourceOf('replaced.jpg', 'earlier upload'),
		});

		const result = await runSweep({ previous: 'previous' });

		expect(getNames(result.renditions.deletions)).toStrictEqual([
			'deleted-450.jpg',
			'moved-900.jpg',
			'replaced-450.jpg',
		]);
		expect(await listFiles(renditionsPath)).toStrictEqual([
			'kept-450.jpg',
			'kept-900.jpg',
			'moved-450.jpg',
		]);
	});

	test('a rendition the live build names stays even when its record is stale', async () => {
		await writeBuild('live', 0, { renditions: { 'replaced-450.jpg': 'replaced.jpg' } });
		await writeFiles(renditionsPath, {
			'replaced-450.jpg': sourceOf('replaced.jpg', 'earlier upload'),
		});

		const prepared = await sweep();

		expect(prepared.renditions.deletions).toStrictEqual([]);
	});

	test('cards are exempt', async () => {
		await writeBuild('live', 0, { renditions: ['kept-450.jpg'] });
		await writeFiles(cardsPath, { 'page.jpg': sourceOf('deleted.jpg', 'gone') });

		const prepared = await sweep();

		expect(prepared.cards.deletions).toStrictEqual([]);
	});
});
