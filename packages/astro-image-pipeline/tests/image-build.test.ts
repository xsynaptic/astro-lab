import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { RenditionRenderRunOptions } from '../src/image-build.js';
import type { ImageManifest } from '../src/image-state.js';

import { readFileRecords, writeFileRecords } from '../src/file-store.js';
import { readFileIfExists } from '../src/files.js';
import { getRenditionKey, prepareRenditionRender } from '../src/image-build.js';
import { resolveImageEncoding } from '../src/image-encoding.js';
import { imageManifestVersion, writeBuildId, writeImageManifest } from '../src/image-state.js';
import { UserError } from '../src/user-error.js';

const sourcePath = 'gallery/source-1.jpg';
const stem = 'gallery/source-1';

const allSizes = [
	'450.webp',
	'600.webp',
	'450x300.webp',
	'600x400.webp',
	'900x600.webp',
	'1200x800.jpg',
	'450.jpg',
	'600.jpg',
	'900.jpg',
	'1200.jpg',
	'900x600.jpg',
	'1200x800.webp',
	'350x233.webp',
	'700x467.webp',
	'64x48.webp',
	'128x96.webp',
];

let root: string;
let mediaPath: string;
let renditionsPath: string;
let keysPath: string;
let distPath: string;
let buildCount = 0;

function getNames(sizes: ReadonlyArray<string>) {
	return sizes.map((size) => `${stem}-${size}`);
}

async function writeBuild(
	sizes: ReadonlyArray<string> = allSizes,
	{ limitInputPixels = 268_402_689 } = {},
) {
	const names = getNames(sizes);
	const manifest = {
		buildId: `build-${String(++buildCount)}`,
		cards: {},
		encoding: resolveImageEncoding({ jpg: { quality: 85 }, webp: { quality: 70 } }),
		limitInputPixels,
		mediaPath,
		renditions: Object.fromEntries(names.map((name) => [name, sourcePath])),
		version: imageManifestVersion,
	} satisfies ImageManifest;

	await writeImageManifest(root, manifest);
	await writeBuildId(distPath, manifest.buildId);

	return names;
}

async function writeSource(width: number, height: number) {
	await sharp({
		create: { background: '#336699', channels: 3, height, width },
	})
		.composite([
			{
				input: { create: { background: '#cc9933', channels: 3, height: 100, width: 100 } },
				left: 40,
				top: 40,
			},
		])
		.withExif({ IFD0: { Copyright: 'source' } })
		.jpeg()
		.toFile(path.join(mediaPath, sourcePath));
}

async function render(options: RenditionRenderRunOptions = {}) {
	const prepared = await prepareRenditionRender({ distPath, storePath: root });

	return prepared.run(options);
}

function sortNames(names: ReadonlyArray<string>) {
	return names.toSorted((first, second) => first.localeCompare(second));
}

async function listFiles() {
	if (!existsSync(renditionsPath)) return [];

	const names = await fs.readdir(renditionsPath, { recursive: true });

	return sortNames(names.filter((name) => /\.(?:jpg|webp)$/.test(name)));
}

function getDeadPid() {
	return spawnSync(process.execPath, ['--eval', '']).pid;
}

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(tmpdir(), 'image-build-'));
	mediaPath = path.join(root, 'media');
	renditionsPath = path.join(root, 'renditions');
	keysPath = `${renditionsPath}-keys.json`;
	distPath = path.join(root, 'dist');

	await fs.mkdir(path.join(mediaPath, path.dirname(sourcePath)), { recursive: true });
	await fs.mkdir(distPath);
	await writeSource(1500, 1000);
});

afterEach(async () => {
	await fs.rm(root, { force: true, recursive: true });
});

describe('prepareRenditionRender', () => {
	test('knows the total before anything renders', async () => {
		const names = await writeBuild();
		const prepared = await prepareRenditionRender({ distPath, storePath: root });

		expect(prepared.total).toBe(names.length);
		expect(await listFiles()).toEqual([]);
	});

	test('every file is rendered at the size its name states, with metadata stripped', async () => {
		const names = await writeBuild();
		const counts = await render();

		expect(counts.rendered).toBe(names.length);

		const files = await listFiles();

		for (const name of files) {
			const [, width, height, format] = /-(\d+)(?:x(\d+))?\.(jpg|webp)$/.exec(name) ?? [];
			const metadata = await sharp(path.join(renditionsPath, name)).metadata();

			expect(metadata.width).toBe(Number(width));
			if (height) expect(metadata.height).toBe(Number(height));
			expect(metadata.format).toBe(format === 'jpg' ? 'jpeg' : format);
			expect(metadata.exif).toBeUndefined();
		}
	});

	test('a source edit regenerates its files and hands each overwrite to the caller', async () => {
		const names = await writeBuild();

		await render();

		const sourceFilePath = path.join(mediaPath, sourcePath);
		const edited = await sharp(sourceFilePath).modulate({ brightness: 1.2 }).jpeg().toBuffer();
		const replaced: Array<string> = [];

		await fs.writeFile(sourceFilePath, edited);
		await writeBuild();

		const counts = await render({
			onReplace: (name) => {
				replaced.push(name);

				return Promise.resolve();
			},
		});

		expect(counts.overwritten).toBe(names.length);
		expect(sortNames(replaced)).toEqual(sortNames(names));
	});

	test('every file records its source digest, fresh ones included, keeping its age', async () => {
		const [name = ''] = await writeBuild(['450.webp']);

		await render();

		const records = await readFileRecords(renditionsPath);
		const { key = '' } = records.get(name) ?? {};
		const digest = createHash('sha256')
			.update(await fs.readFile(path.join(mediaPath, sourcePath)))
			.digest('hex');

		await writeFileRecords(renditionsPath, new Map([[name, { key, namedAt: 'then' }]]));

		const counts = await render();

		expect(counts.fresh).toBe(1);
		const rerecorded = await readFileRecords(renditionsPath);

		expect(rerecorded.get(name)).toStrictEqual({
			key,
			namedAt: 'then',
			source: { digest, path: sourcePath },
		});
	});

	test('an identical regeneration leaves the file and its mtime alone', async () => {
		const names = await writeBuild();

		await render();

		const past = new Date('2020-01-01');
		const files = await listFiles();

		for (const name of files) await fs.utimes(path.join(renditionsPath, name), past, past);
		await fs.rm(keysPath);

		const counts = await render();

		expect(counts.rendered).toBe(names.length);
		expect(counts.written).toBe(0);
		expect(counts.overwritten).toBe(0);

		for (const name of files) {
			const stats = await fs.stat(path.join(renditionsPath, name));

			expect(stats.mtimeMs).toBe(past.getTime());
		}
	});

	test('an interrupted run resumes without re-encoding finished files', async () => {
		const names = await writeBuild();
		const controller = new AbortController();

		await expect(
			render({
				onProgress: () => {
					controller.abort();
				},
				signal: controller.signal,
			}),
		).rejects.toThrow();

		const { length: finished } = await listFiles();

		expect(finished).toBeGreaterThan(0);
		expect(finished).toBeLessThan(names.length);

		const counts = await render();

		expect(counts.fresh).toBe(finished);
		expect(counts.rendered).toBe(names.length - finished);
	});

	test('a touched source with unchanged bytes re-encodes nothing', async () => {
		const sourceFilePath = path.join(mediaPath, sourcePath);
		const touched = new Date(Date.now() + 60_000);

		await writeBuild();
		await render();
		await fs.utimes(sourceFilePath, touched, touched);

		const counts = await render();

		expect(counts.rendered).toBe(0);
	});

	test('a completed render clears the renders dev made for itself', async () => {
		const devFile = path.join(root, 'dev', 'media-key', `${stem}-450.jpg`);

		await writeBuild();
		await fs.mkdir(path.dirname(devFile), { recursive: true });
		await fs.writeFile(devFile, 'dev');
		await render();

		expect(existsSync(path.join(root, 'dev'))).toBe(false);
	});
});

// A new key re-renders the whole library (about an hour), so this only changes on purpose
describe('getRenditionKey', () => {
	test('stays pinned for a fixed input', () => {
		const key = getRenditionKey({
			digest: 'a'.repeat(64),
			encoding: resolveImageEncoding({ jpg: { quality: 85 } }).jpg,
			engine: 'engine',
			format: 'jpg',
			height: 800,
			width: 1200,
		});

		expect(key).toBe('9544a2e15263848d');
	});
});

describe('prepareRenditionRender failure policy', () => {
	test('a source over the pixel limit fails the run without writing a file', async () => {
		await writeBuild(allSizes, { limitInputPixels: 1_000_000 });

		await expect(render()).rejects.toThrow(/16 files failed to render:\n.+exceeds pixel limit/);
		expect(await listFiles()).toEqual([]);
	});
});

describe('prepareRenditionRender guards', () => {
	test('refuses a manifest from before the current version', async () => {
		await writeBuild();
		await fs.writeFile(
			path.join(root, 'manifests', `build-${String(buildCount)}.json.gz`),
			gzipSync(JSON.stringify({ buildId: 'old', files: {} })),
		);

		await expect(render()).rejects.toThrow(/version 1, not 7; rebuild first/);
	});

	test('refuses a dist whose build left no manifest', async () => {
		await writeBuild();
		await writeBuildId(distPath, 'another-build');

		await expect(render()).rejects.toThrow(/No image manifest for build another-build/);
		expect(await listFiles()).toEqual([]);
	});

	test('refuses a dist with no build id', async () => {
		await writeBuild();
		await fs.rm(path.join(distPath, 'image-build-id.txt'));

		await expect(render()).rejects.toThrow(UserError);
	});

	test('refuses a name larger than its source, so a shrunk source never upscales', async () => {
		await writeBuild();
		await writeSource(1000, 667);

		await expect(render()).rejects.toThrow(/larger than their source/);
		expect(await listFiles()).toEqual([]);
	});

	test('refuses when a source vanished after the build', async () => {
		await writeBuild();
		await fs.rm(path.join(mediaPath, sourcePath));

		await expect(render()).rejects.toThrow(/vanished/);
		expect(await listFiles()).toEqual([]);
	});

	test('refuses while a live process holds the lock, and leaves its lock in place', async () => {
		const lockPath = `${renditionsPath}.lock`;

		await writeBuild();
		await fs.writeFile(lockPath, String(process.pid));

		await expect(render()).rejects.toThrow(`pid ${String(process.pid)}`);

		const lock = await readFileIfExists(lockPath);

		expect(lock?.toString('utf8')).toBe(String(process.pid));
	});

	test('takes over a lock whose holder is dead, then releases it', async () => {
		const lockPath = `${renditionsPath}.lock`;

		await writeBuild();
		await fs.writeFile(lockPath, String(getDeadPid()));

		const counts = await render();

		expect(counts.rendered).toBe(allSizes.length);
		expect(existsSync(lockPath)).toBe(false);
	});
});
