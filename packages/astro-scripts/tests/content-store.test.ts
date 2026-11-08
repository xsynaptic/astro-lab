import { sync } from 'astro';
import { mkdir, mkdtemp, realpath, rm, symlink, unlink, utimes, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { OutputEvent } from '../src/output/events.js';

import { getCollectionEntries, withAstroContent } from '../src/astro.js';
import { captureOutput } from '../src/output/output.js';

const astroPackagePath = path.dirname(createRequire(import.meta.url).resolve('astro/package.json'));

const contentConfig = `import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';

export const collections = {
	posts: defineCollection({
		loader: glob({ base: './src/content/posts', pattern: '*.md' }),
		schema: z.object({ published: z.coerce.date(), title: z.string() }),
	}),
};
`;

const posts = {
	first: '---\ntitle: First\npublished: 2026-01-02\n---\n\nFirst body.\n',
	second: '---\ntitle: Second\npublished: 2026-02-03\n---\n\nSecond body.\n',
};

let root: string;

async function createProject({ hasCacheDir }: { hasCacheDir: boolean }) {
	root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'astro-scripts-content-')));

	await mkdir(path.join(root, 'node_modules'));
	await symlink(astroPackagePath, path.join(root, 'node_modules/astro'), 'dir');
	await writeFile(
		path.join(root, 'astro.config.mjs'),
		hasCacheDir ? "export default { cacheDir: './.astro/' };\n" : 'export default {};\n',
	);
	await mkdir(path.join(root, 'src/content/posts'), { recursive: true });
	await writeFile(path.join(root, 'src/content.config.ts'), contentConfig);

	for (const [name, text] of Object.entries(posts)) {
		await writeFile(postPath(name), text);
	}

	await sync({ logLevel: 'silent', root });
	vi.spyOn(process, 'cwd').mockReturnValue(root);
}

function postPath(name: string) {
	return path.join(root, 'src/content/posts', `${name}.md`);
}

async function touchInFuture(filePath: string) {
	const future = new Date(Date.now() + 60_000);

	await utimes(filePath, future, future);
}

function readPosts() {
	return captureOutput(() =>
		withAstroContent((content) => getCollectionEntries(content, ['posts'])),
	);
}

function warningsOf(events: Array<OutputEvent>) {
	return events.flatMap((event) =>
		event.type === 'message' && event.level === 'warn' ? [event.text] : [],
	);
}

afterEach(async () => {
	vi.restoreAllMocks();
	await rm(root, { force: true, recursive: true });
});

describe('content store bridge against a real Astro project', () => {
	test('reads synced entries with their schema types', async () => {
		await createProject({ hasCacheDir: true });

		const { events, result } = await readPosts();

		expect(
			result.map((entry) => entry.id).toSorted((left, right) => left.localeCompare(right)),
		).toEqual(['first', 'second']);
		expect(result.every((entry) => entry.data.published instanceof Date)).toBe(true);
		expect(warningsOf(events)).toEqual([]);
	});

	test('a touched but unchanged entry does not warn', async () => {
		await createProject({ hasCacheDir: true });
		await touchInFuture(postPath('first'));

		const { events } = await readPosts();

		expect(warningsOf(events)).toEqual([]);
	});

	test('an edited entry warns with its path', async () => {
		await createProject({ hasCacheDir: true });
		await writeFile(postPath('first'), posts.first.replace('First body.', 'Edited body.'));
		await touchInFuture(postPath('first'));

		const { events } = await readPosts();

		expect(warningsOf(events)).toEqual([
			'The content store predates changes to src/content/posts/first.md; run `astro sync`',
		]);
	});

	test('a deleted entry warns with its path', async () => {
		await createProject({ hasCacheDir: true });
		await unlink(postPath('second'));

		const { events } = await readPosts();

		expect(warningsOf(events)).toEqual([
			'The content store predates changes to src/content/posts/second.md; run `astro sync`',
		]);
	});

	test('without `cacheDir`, the store check names the cause before booting', async () => {
		await createProject({ hasCacheDir: false });

		await expect(readPosts()).rejects.toThrow(/cacheDir: '\.\/\.astro\/'/);
	});
});
