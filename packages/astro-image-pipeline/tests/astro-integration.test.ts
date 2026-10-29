import type { AstroIntegration, AstroIntegrationLogger } from 'astro';

import { existsSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { RenditionSize } from '../src/image-name.js';

import imagePipeline from '../src/astro-integration.js';
import { getCardName } from '../src/card-name.js';
import { imageRecordsVariable } from '../src/image-recorder.js';
import { getRenditionName } from '../src/image-sizes.js';
import {
	listImageBuilds,
	readDistManifest,
	readLatestManifest,
	writeBuildId,
} from '../src/image-state.js';

type Hooks = AstroIntegration['hooks'];

const cardSize = { format: 'webp', height: 400, width: 600 } satisfies RenditionSize;

const cardFormat = { format: 'jpg' } as const;

let root: string;

function createLogger() {
	return { info: vi.fn(), warn: vi.fn() } as unknown as AstroIntegrationLogger;
}

function createIntegration() {
	return imagePipeline({
		baseUrl: '/img',
		mediaPath: path.join(root, 'media'),
		storePath: root,
	});
}

async function startBuild(hooks: Hooks, { isIncremental = false } = {}) {
	await hooks['astro:config:setup']?.({
		command: 'build',
		config: { experimental: { incrementalBuild: isIncremental } },
	} as unknown as Parameters<NonNullable<Hooks['astro:config:setup']>>[0]);
}

async function finishBuild(hooks: Hooks, pageCount = 1) {
	await hooks['astro:build:done']?.({
		dir: pathToFileURL(`${path.join(root, 'dist')}/`),
		logger: createLogger(),
		pages: Array.from({ length: pageCount }, () => ({ pathname: '/' })),
	} as unknown as Parameters<NonNullable<Hooks['astro:build:done']>>[0]);
}

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(tmpdir(), 'image-integration-'));
	await fs.mkdir(path.join(root, 'dist'));
});

afterEach(async () => {
	Reflect.deleteProperty(process.env, imageRecordsVariable);
	await fs.rm(root, { force: true, recursive: true });
});

describe('imagePipeline', () => {
	test.each(['/', '//', ''])('refuses %j as a base URL', (baseUrl) => {
		expect(() =>
			imagePipeline({
				baseUrl,
				mediaPath: 'media',
				storePath: 'cache',
			}),
		).toThrow('below the site root');
	});

	test('without a base URL, records cards and serves nothing in dev', async () => {
		const { hooks } = imagePipeline({ mediaPath: path.join(root, 'media'), storePath: root });
		const use = vi.fn();

		await hooks['astro:server:setup']?.({
			logger: createLogger(),
			server: { middlewares: { use } },
		} as unknown as Parameters<NonNullable<Hooks['astro:server:setup']>>[0]);
		await startBuild(hooks);
		getCardName({ id: 'atlas', input: { title: 'Atlas' } }, cardFormat);
		await finishBuild(hooks);

		const manifest = await readDistManifest({ distPath: path.join(root, 'dist'), storePath: root });

		expect(use).not.toHaveBeenCalled();
		expect(Object.keys(manifest.cards)).toEqual(['atlas.jpg']);
	});
});

describe('imagePipeline recording', () => {
	test('names built during the build become the manifest, mapped to their sources', async () => {
		const { hooks } = createIntegration();

		await startBuild(hooks);
		getRenditionName({ height: 1000, id: 'a/b.jpg', width: 1500 }, cardSize);
		getRenditionName({ height: 1000, id: 'a/b.jpg', width: 1500 }, cardSize);
		getRenditionName({ height: 1000, id: 'c.jpg', path: 'elsewhere/c.jpg', width: 1500 }, cardSize);
		await finishBuild(hooks);

		const manifest = await readLatestManifest(root);

		expect(manifest?.renditions).toStrictEqual({
			'a/b-600x400.webp': 'a/b.jpg',
			'c-600x400.webp': 'elsewhere/c.jpg',
		});
		expect(existsSync(path.join(root, 'records'))).toBe(false);
		expect(process.env[imageRecordsVariable]).toBeUndefined();
	});

	test('width-only names enter the manifest beside cropped ones', async () => {
		const { hooks } = createIntegration();

		await startBuild(hooks);
		getRenditionName(
			{ height: 1000, id: 'a/b.jpg', width: 1500 },
			{ format: 'jpg', height: 300, width: 400 },
		);
		getRenditionName(
			{ height: 1000, id: 'c.jpg', path: 'elsewhere/c.jpg', width: 1500 },
			{ format: 'jpg', width: 1500 },
		);
		await finishBuild(hooks);

		const manifest = await readLatestManifest(root);

		expect(manifest?.renditions).toStrictEqual({
			'a/b-400x300.jpg': 'a/b.jpg',
			'c-1500.jpg': 'elsewhere/c.jpg',
		});
	});

	test('a name recorded from two sources fails the build', async () => {
		const { hooks } = createIntegration();

		await startBuild(hooks);
		getRenditionName({ height: 1000, id: 'a/b.jpg', width: 1500 }, cardSize);
		getRenditionName({ height: 1000, id: 'a/b.png', width: 1500 }, cardSize);

		await expect(finishBuild(hooks)).rejects.toThrow(/recorded from more than one source/);
		expect(existsSync(path.join(root, 'records'))).toBe(true);
	});

	test('pages built with nothing recorded fail the build', async () => {
		const { hooks } = createIntegration();

		await startBuild(hooks);

		await expect(finishBuild(hooks)).rejects.toThrow(/No image names were recorded/);
		expect(existsSync(path.join(root, 'manifest.json'))).toBe(false);
	});

	test('an incremental build that renders no page keeps the previous names', async () => {
		const full = createIntegration();

		await startBuild(full.hooks);
		getRenditionName({ height: 1000, id: 'a/b.jpg', width: 1500 }, cardSize);
		await finishBuild(full.hooks);

		const incremental = createIntegration();

		await startBuild(incremental.hooks, { isIncremental: true });
		await finishBuild(incremental.hooks);

		const manifest = await readLatestManifest(root);

		expect(manifest?.renditions).toStrictEqual({ 'a/b-600x400.webp': 'a/b.jpg' });
	});

	test('a second build in the same process records its own names', async () => {
		const first = createIntegration();

		await startBuild(first.hooks);
		getRenditionName({ height: 1000, id: 'a/b.jpg', width: 1500 }, cardSize);
		await finishBuild(first.hooks);

		const second = createIntegration();

		await startBuild(second.hooks);
		getRenditionName({ height: 1000, id: 'c.jpg', width: 1500 }, cardSize);
		await finishBuild(second.hooks);

		const manifest = await readLatestManifest(root);

		expect(manifest?.renditions).toStrictEqual({ 'c-600x400.webp': 'c.jpg' });
	});

	test('nothing is recorded outside a build', () => {
		getRenditionName({ height: 1000, id: 'a/b.jpg', width: 1500 }, cardSize);

		expect(existsSync(path.join(root, 'records'))).toBe(false);
	});
});

describe('imagePipeline card recording', () => {
	test('the same card recorded with keys in another order, or located by path, is one card stored canonically', async () => {
		const { hooks } = createIntegration();

		await startBuild(hooks);
		getRenditionName({ height: 1000, id: 'a/b.jpg', width: 1500 }, cardSize);
		getCardName(
			{
				id: 'posts-a',
				image: { id: 'a/b.jpg' },
				input: Object.fromEntries([
					['title', 'A'],
					['collection', 'posts'],
					['titleZh', undefined],
				]),
			},
			cardFormat,
		);
		getCardName(
			{
				id: 'posts-a',
				image: { id: 'media/b', path: 'a/b.jpg' },
				input: { collection: 'posts', title: 'A' },
			},
			cardFormat,
		);
		await finishBuild(hooks);

		const manifest = await readLatestManifest(root);
		const card = manifest?.cards['posts-a.jpg'];

		expect(card).toStrictEqual({
			image: { path: 'a/b.jpg' },
			input: { collection: 'posts', title: 'A' },
		});
		expect(Object.keys(card?.input ?? {})).toStrictEqual(['collection', 'title']);
	});

	test('a build that records only cards succeeds', async () => {
		const { hooks } = createIntegration();

		await startBuild(hooks);
		getCardName({ id: 'posts-a', input: { title: 'A' } }, cardFormat);
		await finishBuild(hooks);

		const manifest = await readLatestManifest(root);

		expect(manifest?.renditions).toStrictEqual({});
		expect(Object.keys(manifest?.cards ?? {})).toStrictEqual(['posts-a.jpg']);
	});

	test('one card name recorded with different input fails the build', async () => {
		const { hooks } = createIntegration();

		await startBuild(hooks);
		getRenditionName({ height: 1000, id: 'a/b.jpg', width: 1500 }, cardSize);
		getCardName({ id: 'posts-a', input: { title: 'A' } }, cardFormat);
		getCardName({ id: 'posts-a', input: { title: 'B' } }, cardFormat);

		await expect(finishBuild(hooks)).rejects.toThrow(/1 cards were recorded with different input/);
	});

	test('one card name recorded with a different treatment fails the build', async () => {
		const { hooks } = createIntegration();

		await startBuild(hooks);
		getRenditionName({ height: 1000, id: 'a/b.jpg', width: 1500 }, cardSize);
		getCardName(
			{
				id: 'posts-a',
				image: { id: 'a/b.jpg' },
				input: { title: 'A' },
			},
			cardFormat,
		);
		getCardName(
			{
				id: 'posts-a',
				image: { id: 'a/b.jpg', treatment: 'blur' },
				input: { title: 'A' },
			},
			cardFormat,
		);

		await expect(finishBuild(hooks)).rejects.toThrow(/recorded with different input/);
	});

	test('an incremental build keeps the previous cards beside the ones it records', async () => {
		const full = createIntegration();

		await startBuild(full.hooks);
		getRenditionName({ height: 1000, id: 'a/b.jpg', width: 1500 }, cardSize);
		getCardName({ id: 'posts-a', input: { title: 'A' } }, cardFormat);
		await finishBuild(full.hooks);

		const incremental = createIntegration();

		await startBuild(incremental.hooks, { isIncremental: true });
		getCardName({ id: 'posts-b', input: { title: 'B' } }, cardFormat);
		await finishBuild(incremental.hooks);

		const manifest = await readLatestManifest(root);

		expect(manifest?.cards).toStrictEqual({
			'posts-a.jpg': { input: { title: 'A' } },
			'posts-b.jpg': { input: { title: 'B' } },
		});
	});
});

async function buildOnce(id: string) {
	const { hooks } = createIntegration();

	await startBuild(hooks);
	getRenditionName({ height: 1000, id, width: 1500 }, cardSize);
	await finishBuild(hooks);

	const manifest = await readLatestManifest(root);

	return manifest?.buildId ?? '';
}

describe('imagePipeline build manifests', () => {
	test('each build keeps its own manifest, read back by the build id in dist', async () => {
		const distPath = path.join(root, 'dist');
		const first = await buildOnce('a.jpg');
		const second = await buildOnce('b.jpg');

		const latest = await readDistManifest({ distPath, storePath: root });

		expect(latest.buildId).toBe(second);
		expect(latest.renditions).toStrictEqual({ 'b-600x400.webp': 'b.jpg' });

		await writeBuildId(distPath, first);

		const previous = await readDistManifest({ distPath, storePath: root });

		expect(previous.buildId).toBe(first);
		expect(previous.renditions).toStrictEqual({ 'a-600x400.webp': 'a.jpg' });
	});

	test('builds are listed newest first, and a failed build lists nothing', async () => {
		const first = await buildOnce('a.jpg');
		const second = await buildOnce('b.jpg');
		const past = new Date('2026-01-01T00:00:00Z');

		await fs.utimes(path.join(root, 'manifests', `${second}.json.gz`), past, past);

		const failed = createIntegration();

		await startBuild(failed.hooks);
		await expect(finishBuild(failed.hooks)).rejects.toThrow();

		const builds = await listImageBuilds(root);

		expect(builds.map((build) => build.buildId)).toStrictEqual([first, second]);
		expect(builds[1]?.writtenAt).toStrictEqual(past);
	});

	test('a cache with no builds lists none', async () => {
		expect(await listImageBuilds(root)).toStrictEqual([]);
	});
});
