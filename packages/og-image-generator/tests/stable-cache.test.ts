import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { CacheStore } from '../src/index.js';

import { createStableCache } from '../src/index.js';

let dir: string;

function memoryStore(): CacheStore {
	const map = new Map<string, string>();

	return {
		get: async (id) => map.get(id),
		set: async (id, key) => {
			map.set(id, key);
		},
	};
}

beforeEach(async () => {
	dir = await fs.mkdtemp(path.join(tmpdir(), 'og-stable-'));
});

afterEach(async () => {
	await fs.rm(dir, { force: true, recursive: true });
});

describe('createStableCache', () => {
	test('writes a stable filename and skips regeneration on a fresh hit', async () => {
		const cache = createStableCache({ dir, store: memoryStore() });
		let calls = 0;
		const generate = async () => {
			calls += 1;
			return Buffer.from('image');
		};

		const first = await cache.resolve({ generate, id: 'card', key: 'k1' });
		const second = await cache.resolve({ generate, id: 'card', key: 'k1' });

		expect(calls).toBe(1);
		expect(first.toString()).toBe('image');
		expect(second.toString()).toBe('image');
		expect(await fs.readdir(dir)).toEqual(['card.jpg']);
	});

	test('regenerates on a key change, keeping the same filename', async () => {
		const cache = createStableCache({ dir, store: memoryStore() });

		await cache.resolve({ generate: async () => Buffer.from('old'), id: 'card', key: 'k1' });
		const updated = await cache.resolve({
			generate: async () => Buffer.from('new'),
			id: 'card',
			key: 'k2',
		});

		expect(updated.toString()).toBe('new');
		expect(await fs.readdir(dir)).toEqual(['card.jpg']);
		const written = await fs.readFile(path.join(dir, 'card.jpg'));
		expect(written.toString()).toBe('new');
	});

	test('isFresh() reports freshness without generating', async () => {
		const cache = createStableCache({ dir, store: memoryStore() });

		expect(await cache.isFresh('card', 'k1')).toBe(false);
		await cache.resolve({ generate: async () => Buffer.from('x'), id: 'card', key: 'k1' });
		expect(await cache.isFresh('card', 'k1')).toBe(true);
		expect(await cache.isFresh('card', 'k2')).toBe(false);
	});

	test('isFresh() is false when the file is gone even if the store matches', async () => {
		const cache = createStableCache({ dir, store: memoryStore() });

		await cache.resolve({ generate: async () => Buffer.from('x'), id: 'card', key: 'k1' });
		await fs.rm(path.join(dir, 'card.jpg'));

		expect(await cache.isFresh('card', 'k1')).toBe(false);
	});

	test('a version bump invalidates an otherwise-fresh entry', async () => {
		const store = memoryStore();
		const v1 = createStableCache({ dir, store, version: '1' });

		await v1.resolve({ generate: async () => Buffer.from('x'), id: 'card', key: 'k1' });
		expect(await v1.isFresh('card', 'k1')).toBe(true);

		const v2 = createStableCache({ dir, store, version: '2' });
		expect(await v2.isFresh('card', 'k1')).toBe(false);

		let calls = 0;
		await v2.resolve({
			generate: async () => {
				calls += 1;
				return Buffer.from('y');
			},
			id: 'card',
			key: 'k1',
		});
		expect(calls).toBe(1);
	});
});
