import type { LoaderContext } from 'astro/loaders';

import { existsSync } from 'node:fs';
import { rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assert, describe, expect, test, vi } from 'vitest';

import type { ImageLoaderCacheValue } from '../../src/types.js';

import { imageLoader } from '../../src/index.js';
import { createFixtureDir, createMockLoaderContext } from './mock-loader-context.js';

function createMockCache() {
	const values = new Map<string, ImageLoaderCacheValue>();

	return {
		cache: {
			get: (key: string) => values.get(key),
			prune: vi.fn(),
			set: vi.fn((key: string, value: ImageLoaderCacheValue) => {
				values.set(key, value);
			}),
		},
		values,
	};
}

describe('imageLoader', () => {
	test('rejects unsafe patterns at creation time', () => {
		expect(() => imageLoader({ pattern: '../escape/*.jpg' })).toThrow('cannot start with `../`');
		expect(() => imageLoader({ pattern: ['*.jpg', '/absolute/*.jpg'] })).toThrow(
			'cannot be absolute paths',
		);
	});

	test('warns and loads nothing when the base directory is missing', async () => {
		const { root } = await createFixtureDir([]);
		const { context, entries, logs } = createMockLoaderContext({ root });

		await imageLoader({ base: 'does-not-exist' }).load(context);

		expect(entries.size).toBe(0);
		expect(logs.some((log) => log.level === 'warn' && log.message.includes('does not exist'))).toBe(
			true,
		);
	});

	test('stores root-relative paths and cache keys for an absolute base', async () => {
		const { dir, root } = await createFixtureDir(['images/a.jpg']);
		const { context, entries } = createMockLoaderContext({ root });

		const prune = vi.fn();
		const cache = { get: vi.fn(), prune, set: vi.fn() };

		// Absolute base previously produced absolute, store-rejected paths
		await imageLoader({ base: path.join(dir, 'images'), cache, dataHandler: () => ({}) }).load(
			context,
		);

		// Id stays glob-relative; src, cache key, and prune key are all root-relative
		expect(entries.get('a.jpg')?.data.src).toBe('images/a.jpg');
		expect(cache.set).toHaveBeenCalledWith('images/a.jpg', expect.any(Object));
		expect(prune).toHaveBeenLastCalledWith(['images/a.jpg']);
	});

	test('discovers matching files, ignoring other extensions and svg by default', async () => {
		const { root } = await createFixtureDir(['a.jpg', 'notes.txt', 'icon.svg', 'nested/b.png']);
		const { context, entries } = createMockLoaderContext({ root });

		await imageLoader({}).load(context);

		expect([...entries.keys()].toSorted((a, b) => a.localeCompare(b))).toEqual([
			'a.jpg',
			'nested/b.png',
		]);
		expect(entries.get('a.jpg')?.data).toMatchObject({ src: 'a.jpg' });
		expect(entries.get('a.jpg')?.data.modifiedTime).toBeInstanceOf(Date);
	});

	test('re-registers persisted asset imports on the digest-skip path', async () => {
		const { root } = await createFixtureDir(['a.jpg']);
		const { addAssetImports, context, entries } = createMockLoaderContext({ root });

		const loader = imageLoader({});

		await loader.load(context);
		expect(addAssetImports).not.toHaveBeenCalled();

		// Simulate a persisted entry whose image() fields produced asset imports
		const entry = entries.get('a.jpg');

		assert(entry);
		entry.assetImports = ['./a.jpg'];

		await loader.load(context);

		expect(addAssetImports).toHaveBeenCalledWith(['./a.jpg'], 'a.jpg');
	});

	test('uses a custom generateId and merges dataHandler output', async () => {
		const { root } = await createFixtureDir(['a.jpg']);
		const { context, entries } = createMockLoaderContext({ root });

		await imageLoader({
			dataHandler: ({ filePathRelative }) => ({ title: `Title for ${filePathRelative}` }),
			generateId: ({ filePath }) => filePath.replace(/\.\w+$/, ''),
		}).load(context);

		expect(entries.has('a')).toBe(true);
		expect(entries.get('a')?.data.title).toBe('Title for a.jpg');
	});

	test('skips unchanged entries and regenerates on extractionVersion or mtime change', async () => {
		const { dir, root } = await createFixtureDir(['a.jpg', 'b.jpg']);
		const { context } = createMockLoaderContext({ root });

		const dataHandler = vi.fn(() => ({ title: 'x' }));

		await imageLoader({ dataHandler, extractionVersion: 'v1' }).load(context);
		expect(dataHandler).toHaveBeenCalledTimes(2);

		// Unchanged reload: digest matches, dataHandler untouched
		await imageLoader({ dataHandler, extractionVersion: 'v1' }).load(context);
		expect(dataHandler).toHaveBeenCalledTimes(2);

		// Changed extraction version: everything regenerates
		await imageLoader({ dataHandler, extractionVersion: 'v2' }).load(context);
		expect(dataHandler).toHaveBeenCalledTimes(4);

		// Touched file: only that entry regenerates
		const future = new Date(Date.now() + 5000);

		await utimes(path.join(dir, 'a.jpg'), future, future);
		await imageLoader({ dataHandler, extractionVersion: 'v2' }).load(context);
		expect(dataHandler).toHaveBeenCalledTimes(5);
	});

	test('removes deleted files from the store and prunes the cache to live keys', async () => {
		const { dir, root } = await createFixtureDir(['a.jpg', 'b.jpg']);
		const { context, entries } = createMockLoaderContext({ root });

		const prune = vi.fn();
		const cache = { get: vi.fn(), prune, set: vi.fn() };
		const loader = imageLoader({ cache, dataHandler: () => ({}) });

		await loader.load(context);
		expect(entries.size).toBe(2);
		expect(prune).toHaveBeenLastCalledWith(expect.arrayContaining(['a.jpg', 'b.jpg']));

		await rm(path.join(dir, 'b.jpg'));
		await loader.load(context);

		expect(entries.has('b.jpg')).toBe(false);
		expect(prune).toHaveBeenLastCalledWith(['a.jpg']);
	});

	describe('cache', () => {
		test('a warm cache repopulates a fresh store without running the dataHandler', async () => {
			const { root } = await createFixtureDir(['a.jpg']);
			const { cache } = createMockCache();
			const dataHandler = vi.fn(() => ({ title: 'cached' }));
			const loader = imageLoader({ cache, dataHandler });

			await loader.load(createMockLoaderContext({ root }).context);
			expect(dataHandler).toHaveBeenCalledTimes(1);
			expect(cache.set).toHaveBeenCalledWith('a.jpg', {
				data: { title: 'cached' },
				digest: expect.any(String) as string,
			});

			// Fresh context = simulated Astro data store wipe; same cache carries the data over
			const { context, entries } = createMockLoaderContext({ root });

			await loader.load(context);

			expect(dataHandler).toHaveBeenCalledTimes(1);
			expect(entries.get('a.jpg')?.data.title).toBe('cached');
		});

		test('a stale cached digest re-runs the dataHandler and overwrites the cache', async () => {
			const { root } = await createFixtureDir(['a.jpg']);
			const { cache, values } = createMockCache();

			values.set('a.jpg', { data: { title: 'old' }, digest: 'stale' });

			const dataHandler = vi.fn(() => ({ title: 'fresh' }));
			const { context, entries } = createMockLoaderContext({ root });

			await imageLoader({ cache, dataHandler }).load(context);

			expect(dataHandler).toHaveBeenCalledTimes(1);
			expect(entries.get('a.jpg')?.data.title).toBe('fresh');
			expect(values.get('a.jpg')?.data).toEqual({ title: 'fresh' });
		});

		test('the built-in JSONL cache lands under cacheDir unless cache is false', async () => {
			const enabled = await createFixtureDir(['a.jpg']);
			const disabled = await createFixtureDir(['a.jpg']);

			await imageLoader({ dataHandler: () => ({}) }).load(
				createMockLoaderContext({ root: enabled.root }).context,
			);
			await imageLoader({ cache: false, dataHandler: () => ({}) }).load(
				createMockLoaderContext({ root: disabled.root }).context,
			);

			expect(
				existsSync(path.join(enabled.dir, '.astro-cache', 'astro-image-loader', 'images.jsonl')),
			).toBe(true);
			expect(existsSync(path.join(disabled.dir, '.astro-cache'))).toBe(false);
		});

		test('base spelling does not affect digests, so cached extraction survives a respelled base', async () => {
			const { root } = await createFixtureDir(['images/a.jpg']);
			const { cache } = createMockCache();
			const dataHandler = vi.fn(() => ({ title: 'x' }));

			await imageLoader({ base: 'images', cache, dataHandler }).load(
				createMockLoaderContext({ root }).context,
			);
			expect(dataHandler).toHaveBeenCalledTimes(1);

			await imageLoader({ base: './images', cache, dataHandler }).load(
				createMockLoaderContext({ root }).context,
			);
			expect(dataHandler).toHaveBeenCalledTimes(1);
		});

		test('derivationVersion refreshes store entries from cache without re-running the dataHandler', async () => {
			const { root } = await createFixtureDir(['a.jpg']);
			const { cache } = createMockCache();
			const { context, entries } = createMockLoaderContext({ root });

			const dataHandler = vi.fn(() => ({ title: 'intrinsic' }));

			await imageLoader({
				cache,
				dataHandler,
				derivationVersion: 'dev',
				extractionVersion: 'v1',
			}).load(context);
			expect(dataHandler).toHaveBeenCalledTimes(1);

			const devDigest = entries.get('a.jpg')?.digest;

			// Context switch (dev -> prod): store entry regenerates, cached extraction is reused
			await imageLoader({
				cache,
				dataHandler,
				derivationVersion: 'prod',
				extractionVersion: 'v1',
			}).load(context);
			expect(dataHandler).toHaveBeenCalledTimes(1);
			expect(entries.get('a.jpg')?.digest).not.toBe(devDigest);

			// extractionVersion busts both store and cache
			await imageLoader({
				cache,
				dataHandler,
				derivationVersion: 'prod',
				extractionVersion: 'v2',
			}).load(context);
			expect(dataHandler).toHaveBeenCalledTimes(2);
		});
	});

	describe('progress', () => {
		test('logs an end-of-sync summary with cache statistics', async () => {
			const { root } = await createFixtureDir(['a.jpg', 'b.jpg']);
			const { cache } = createMockCache();
			const dataHandler = vi.fn(() => ({ title: 'x' }));
			const loader = imageLoader({ cache, dataHandler });

			const first = createMockLoaderContext({ root });

			await loader.load(first.context);
			expect(
				first.logs.some((log) =>
					log.message.includes('Synced 2 images: 0 unchanged, 0 restored from cache, 2 processed'),
				),
			).toBe(true);

			// Fresh store, warm cache: entries restore from cache
			const second = createMockLoaderContext({ root });

			await loader.load(second.context);
			expect(
				second.logs.some((log) =>
					log.message.includes('Synced 2 images: 0 unchanged, 2 restored from cache, 0 processed'),
				),
			).toBe(true);
		});

		test('logs interval lines every progressInterval worked images during the initial sync', async () => {
			const { root } = await createFixtureDir(['a.jpg', 'b.jpg', 'c.jpg']);
			const { context, logs } = createMockLoaderContext({ root });

			await imageLoader({ dataHandler: () => ({}), progressInterval: 1 }).load(context);

			const intervalLines = logs.filter((log) => log.message.startsWith('Processed '));

			expect(intervalLines.map((log) => log.message)).toEqual([
				'Processed 1 image (0 from cache)',
				'Processed 2 images (0 from cache)',
				'Processed 3 images (0 from cache)',
			]);
		});
	});

	describe('watch mode', () => {
		test('handles add, change, and unlink events with real file mtimes', async () => {
			const { dir, root } = await createFixtureDir(['a.jpg']);
			const { context, entries, watcher } = createMockLoaderContext({ root });

			await imageLoader({ debounceMs: 25 }).load(context);

			// The base directory may sit outside the default watch root
			expect(watcher.add).toHaveBeenCalledTimes(1);

			// Added file appears in the store with its actual mtime
			const addedPath = path.join(dir, 'new.jpg');

			await writeFile(addedPath, 'fixture:new.jpg');
			watcherEmit(context, 'add', addedPath);

			await vi.waitFor(
				() => {
					expect(entries.has('new.jpg')).toBe(true);
				},
				{ timeout: 5000 },
			);

			const storedTime = entries.get('new.jpg')?.data.modifiedTime as Date;
			const stats = await stat(addedPath);

			expect(storedTime.getTime()).toBe(stats.mtime.getTime());

			// Deleted file is removed
			watcherEmit(context, 'unlink', addedPath);

			await vi.waitFor(
				() => {
					expect(entries.has('new.jpg')).toBe(false);
				},
				{ timeout: 5000 },
			);
		});

		test('ignores paths that do not match the pattern', async () => {
			const { dir, root } = await createFixtureDir(['a.jpg']);
			const { context, entries } = createMockLoaderContext({ root });

			await imageLoader({ debounceMs: 25 }).load(context);

			await writeFile(path.join(dir, 'readme.txt'), 'not an image');
			await writeFile(path.join(dir, 'b.jpg'), 'fixture:b.jpg');
			watcherEmit(context, 'add', path.join(dir, 'readme.txt'));
			// Queued after readme.txt in the same window, so its arrival means that batch has run
			watcherEmit(context, 'add', path.join(dir, 'b.jpg'));

			await vi.waitFor(
				() => {
					expect(entries.has('b.jpg')).toBe(true);
				},
				{ timeout: 5000 },
			);

			expect(entries.has('readme.txt')).toBe(false);
			expect(entries.size).toBe(2);
		});

		test('watch batches bracket processing with the lifecycle hooks', async () => {
			const { dir, root } = await createFixtureDir(['a.jpg']);
			const { context } = createMockLoaderContext({ root });

			const afterLoad = vi.fn();

			await imageLoader({ afterLoad, debounceMs: 25 }).load(context);
			expect(afterLoad).toHaveBeenCalledTimes(1);

			const touchedPath = path.join(dir, 'a.jpg');
			const future = new Date(Date.now() + 5000);

			await utimes(touchedPath, future, future);
			watcherEmit(context, 'change', touchedPath);

			await vi.waitFor(
				() => {
					expect(afterLoad).toHaveBeenCalledTimes(2);
				},
				{ timeout: 5000 },
			);
		});
	});
});

function watcherEmit(context: LoaderContext, event: string, filePath: string) {
	(context.watcher as unknown as NodeJS.EventEmitter).emit(event, filePath);
}
