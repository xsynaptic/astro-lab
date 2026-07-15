import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';

import { createJsonlCache } from '../src/jsonl-cache.js';

async function getTempCachePath() {
	const dir = await mkdtemp(path.join(tmpdir(), 'jsonl-cache-'));

	return path.join(dir, 'nested', 'cache.jsonl');
}

describe('createJsonlCache', () => {
	test('roundtrips values and reports missing keys as undefined', async () => {
		const cache = createJsonlCache({ filePath: await getTempCachePath() });

		await cache.set('a.jpg', { data: { title: 'one' }, digest: 'd1' });

		expect(await cache.get('a.jpg')).toEqual({ data: { title: 'one' }, digest: 'd1' });
		expect(await cache.get('missing.jpg')).toBeUndefined();
	});

	test('concurrent reads during hydration all see the persisted data', async () => {
		const filePath = await getTempCachePath();
		const seed = createJsonlCache({ filePath });

		await seed.set('a.jpg', { data: {}, digest: 'd1' });
		await seed.set('b.jpg', { data: {}, digest: 'd2' });

		// Fresh instance: both gets race the initial file read
		const cache = createJsonlCache({ filePath });
		const [first, second] = await Promise.all([cache.get('a.jpg'), cache.get('b.jpg')]);

		expect(first).toEqual({ data: {}, digest: 'd1' });
		expect(second).toEqual({ data: {}, digest: 'd2' });
	});

	test('persists across instances', async () => {
		const filePath = await getTempCachePath();
		const first = createJsonlCache({ filePath });

		await first.set('a.jpg', { data: { title: 'one' }, digest: 'd1' });

		const second = createJsonlCache({ filePath });

		expect(await second.get('a.jpg')).toEqual({ data: { title: 'one' }, digest: 'd1' });
	});

	test('the last line wins for duplicate keys', async () => {
		const filePath = await getTempCachePath();
		const cache = createJsonlCache({ filePath });

		await cache.set('a.jpg', { data: { title: 'old' }, digest: 'd1' });
		await cache.set('a.jpg', { data: { title: 'new' }, digest: 'd2' });

		const rereadCache = createJsonlCache({ filePath });

		expect(await rereadCache.get('a.jpg')).toEqual({ data: { title: 'new' }, digest: 'd2' });
	});

	test('skips malformed lines from interrupted writes', async () => {
		const filePath = await getTempCachePath();
		const seed = createJsonlCache({ filePath });

		await seed.set('a.jpg', { data: {}, digest: 'd1' });

		await writeFile(filePath, `${await readFile(filePath, 'utf8')}{"key":"b.jpg","val`);

		const cache = createJsonlCache({ filePath });

		expect(await cache.get('a.jpg')).toEqual({ data: {}, digest: 'd1' });
		expect(await cache.get('b.jpg')).toBeUndefined();
	});

	test('prune compacts the file down to live keys', async () => {
		const filePath = await getTempCachePath();
		const cache = createJsonlCache({ filePath });

		await cache.set('a.jpg', { data: {}, digest: 'd1' });
		await cache.set('a.jpg', { data: {}, digest: 'd2' });
		await cache.set('deleted.jpg', { data: {}, digest: 'd3' });

		await cache.prune?.(['a.jpg']);

		expect(await cache.get('deleted.jpg')).toBeUndefined();
		expect(await cache.get('a.jpg')).toEqual({ data: {}, digest: 'd2' });

		const contents = await readFile(filePath, 'utf8');
		const lines = contents.split('\n').filter(Boolean);

		expect(lines).toHaveLength(1);
	});

	test('appends still work after a prune compaction', async () => {
		const filePath = await getTempCachePath();
		const cache = createJsonlCache({ filePath });

		await cache.set('a.jpg', { data: {}, digest: 'd1' });
		await cache.set('stale.jpg', { data: {}, digest: 'd2' });
		await cache.prune?.(['a.jpg']);
		await cache.set('b.jpg', { data: {}, digest: 'd3' });

		const rereadCache = createJsonlCache({ filePath });

		expect(await rereadCache.get('a.jpg')).toEqual({ data: {}, digest: 'd1' });
		expect(await rereadCache.get('b.jpg')).toEqual({ data: {}, digest: 'd3' });
		expect(await rereadCache.get('stale.jpg')).toBeUndefined();
	});

	test('prune skips the rewrite when the file already mirrors live entries', async () => {
		const filePath = await getTempCachePath();
		const seed = createJsonlCache({ filePath });

		await seed.set('a.jpg', { data: {}, digest: 'd1' });
		await seed.set('b.jpg', { data: {}, digest: 'd2' });

		// Warm-load shape: fresh instance hydrates, every key is live
		const cache = createJsonlCache({ filePath });

		await cache.get('a.jpg');

		const statsBefore = await stat(filePath);

		await cache.prune?.(['a.jpg', 'b.jpg']);

		// Compaction rewrites via temp file + rename, which changes the inode
		const statsAfter = await stat(filePath);

		expect(statsAfter.ino).toBe(statsBefore.ino);
	});

	test('prune compacts superseded duplicate lines even when every key is live', async () => {
		const filePath = await getTempCachePath();
		const cache = createJsonlCache({ filePath });

		await cache.set('a.jpg', { data: {}, digest: 'd1' });
		await cache.set('a.jpg', { data: {}, digest: 'd2' });

		await cache.prune?.(['a.jpg']);

		const contents = await readFile(filePath, 'utf8');
		const lines = contents.split('\n').filter(Boolean);

		expect(lines).toHaveLength(1);
		expect(await cache.get('a.jpg')).toEqual({ data: {}, digest: 'd2' });
	});

	test('a failed initial read degrades to an empty cache instead of throwing', async () => {
		const filePath = await getTempCachePath();

		// A directory at the cache path makes readFile fail while existsSync passes
		await mkdir(filePath, { recursive: true });

		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
			// Silence the expected warning
		});
		const cache = createJsonlCache({ filePath });

		expect(await cache.get('a.jpg')).toBeUndefined();
		expect(warnSpy).toHaveBeenCalledOnce();

		warnSpy.mockRestore();
	});
});
