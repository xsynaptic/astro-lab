import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createContentHashCache } from '../src/index.js';

let dir: string;

beforeEach(async () => {
	dir = await fs.mkdtemp(path.join(tmpdir(), 'og-cache-'));
});

afterEach(async () => {
	await fs.rm(dir, { force: true, recursive: true });
});

describe('createContentHashCache', () => {
	test('generates on miss and reads through on hit', async () => {
		const cache = createContentHashCache({ dir });
		let calls = 0;
		const generate = async () => {
			calls += 1;
			return Buffer.from('image-a');
		};

		const first = await cache.resolve({ generate, id: 'card', key: 'k1' });
		const second = await cache.resolve({ generate, id: 'card', key: 'k1' });

		expect(calls).toBe(1);
		expect(first.toString()).toBe('image-a');
		expect(second.toString()).toBe('image-a');
	});

	test('dedupes concurrent misses to a single generate', async () => {
		const cache = createContentHashCache({ dir });
		let calls = 0;
		const generate = async () => {
			calls += 1;
			await new Promise((resolve) => setTimeout(resolve, 20));
			return Buffer.from('busy');
		};

		await Promise.all([
			cache.resolve({ generate, id: 'card', key: 'k' }),
			cache.resolve({ generate, id: 'card', key: 'k' }),
			cache.resolve({ generate, id: 'card', key: 'k' }),
		]);

		expect(calls).toBe(1);
	});

	test('prunes stale variants of the same id when the key changes', async () => {
		const cache = createContentHashCache({ dir });

		await cache.resolve({ generate: async () => Buffer.from('old'), id: 'card', key: 'old' });
		await cache.resolve({ generate: async () => Buffer.from('new'), id: 'card', key: 'new' });

		expect(await fs.readdir(dir)).toEqual(['card.new.jpg']);
	});

	test('keeps variants with different ids', async () => {
		const cache = createContentHashCache({ dir });

		await cache.resolve({ generate: async () => Buffer.from('a'), id: 'alpha', key: 'k' });
		await cache.resolve({ generate: async () => Buffer.from('b'), id: 'beta', key: 'k' });

		const files = await fs.readdir(dir);
		expect(files).toHaveLength(2);
		expect(files).toContain('alpha.k.jpg');
		expect(files).toContain('beta.k.jpg');
	});
});
