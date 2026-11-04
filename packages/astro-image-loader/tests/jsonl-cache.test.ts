import type * as nodeFs from 'node:fs';
import type * as nodeFsPromises from 'node:fs/promises';

import { fc, test } from '@fast-check/vitest';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, vi } from 'vitest';

import type { ImageLoaderCacheValue } from '../src/types.js';

import { createJsonlCache } from '../src/jsonl-cache.js';

interface FakeInode {
	content: string;
}

// An in-memory disk with inodes, so a rename orphans open streams as a real one does
const fakeDisk = vi.hoisted(() => ({
	files: new Map<string, FakeInode>(),
	isActive: false,
	maxOpenStreams: 0,
	openStreams: 0,
	tick: undefined as (() => Promise<void>) | undefined,
}));

function getInode(filePath: string) {
	const inode = fakeDisk.files.get(filePath);

	if (!inode) throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });

	return inode;
}

async function afterTick(previous: Promise<FakeInode>, step: (inode: FakeInode) => void) {
	const inode = await previous;

	await fakeDisk.tick?.();
	step(inode);

	return inode;
}

function createFakeAppendStream(filePath: string) {
	let isEnded = false;

	async function open() {
		await fakeDisk.tick?.();

		const inode = fakeDisk.files.get(filePath) ?? { content: '' };

		fakeDisk.files.set(filePath, inode);

		return inode;
	}

	let pending = open();

	fakeDisk.openStreams++;
	fakeDisk.maxOpenStreams = Math.max(fakeDisk.maxOpenStreams, fakeDisk.openStreams);

	return {
		end(callback: () => void) {
			isEnded = true;
			pending = afterTick(pending, () => {
				fakeDisk.openStreams--;
				callback();
			});
		},
		write(line: string, callback: (error?: Error) => void) {
			if (isEnded) {
				queueMicrotask(() => {
					callback(new Error('write after end'));
				});
				return;
			}

			pending = afterTick(pending, (inode) => {
				inode.content += line;
				callback();
			});
		},
	};
}

vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof nodeFs>();

	return {
		...actual,
		createWriteStream: (...args: Parameters<typeof actual.createWriteStream>) =>
			fakeDisk.isActive
				? createFakeAppendStream(String(args[0]))
				: actual.createWriteStream(...args),
		existsSync: (filePath: string) =>
			fakeDisk.isActive ? fakeDisk.files.has(filePath) : actual.existsSync(filePath),
	};
});

vi.mock('node:fs/promises', async (importOriginal) => {
	const actual = await importOriginal<typeof nodeFsPromises>();

	return {
		...actual,
		mkdir: async (...args: Parameters<typeof actual.mkdir>) => {
			if (!fakeDisk.isActive) return actual.mkdir(...args);

			await fakeDisk.tick?.();
			return String(args[0]);
		},
		readFile: async (...args: Parameters<typeof actual.readFile>) => {
			if (!fakeDisk.isActive) return actual.readFile(...args);

			await fakeDisk.tick?.();
			return getInode(String(args[0])).content;
		},
		rename: async (...args: Parameters<typeof actual.rename>) => {
			if (!fakeDisk.isActive) return actual.rename(...args);

			await fakeDisk.tick?.();
			fakeDisk.files.set(String(args[1]), getInode(String(args[0])));
			fakeDisk.files.delete(String(args[0]));
		},
		writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
			if (!fakeDisk.isActive) return actual.writeFile(...args);

			await fakeDisk.tick?.();
			fakeDisk.files.set(String(args[0]), { content: String(args[1]) });
		},
	};
});

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

	const cacheKeys = ['a.jpg', 'b.jpg', 'c.jpg'];

	// Prune only between rounds: the cache contract rules out a set in flight during prune
	const cacheRounds = fc.array(
		fc.record(
			{
				prune: fc.option(fc.subarray(cacheKeys), { nil: undefined }),
				sets: fc.array(fc.constantFrom(...cacheKeys), { maxLength: 4, minLength: 1 }),
			},
			{ noNullPrototype: true },
		),
		{ maxLength: 4, minLength: 1 },
	);

	async function readAll(cache: ReturnType<typeof createJsonlCache>) {
		const entries = await Promise.all(cacheKeys.map(async (key) => [key, await cache.get(key)]));

		return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
	}

	test.prop([fc.scheduler(), fc.array(fc.constantFrom(...cacheKeys)), cacheRounds])(
		'a reload sees what the live cache holds, whatever order concurrent sets land in',
		async (scheduler, seeded, rounds) => {
			const filePath = '/fake/cache.jsonl';
			let digest = 0;

			function nextValue(): ImageLoaderCacheValue {
				digest++;
				return { data: {}, digest: `d${String(digest)}` };
			}

			fakeDisk.files = new Map(
				seeded.length > 0
					? [
							[
								filePath,
								{
									content: seeded
										.map((key) => `${JSON.stringify({ key, value: nextValue() })}\n`)
										.join(''),
								},
							],
						]
					: [],
			);
			fakeDisk.isActive = true;
			fakeDisk.maxOpenStreams = 0;
			fakeDisk.openStreams = 0;
			fakeDisk.tick = () => scheduler.schedule(Promise.resolve());

			try {
				const cache = createJsonlCache({ filePath });

				for (const { prune, sets } of rounds) {
					const results = await scheduler.waitFor(
						Promise.allSettled(sets.map((key) => cache.set(key, nextValue()))),
					);

					expect(results.filter((result) => result.status === 'rejected')).toStrictEqual([]);
					expect(fakeDisk.maxOpenStreams).toBeLessThanOrEqual(1);

					if (prune) await scheduler.waitFor(Promise.resolve(cache.prune?.(prune)));
				}

				const live = await scheduler.waitFor(readAll(cache));
				const reloaded = await scheduler.waitFor(readAll(createJsonlCache({ filePath })));

				expect(reloaded).toStrictEqual(live);
			} finally {
				fakeDisk.isActive = false;
			}
		},
	);
});
