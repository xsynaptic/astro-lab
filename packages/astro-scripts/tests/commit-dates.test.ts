import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { readChild } from '../src/child.js';
import { getEntryCommitDates } from '../src/commit-dates.js';

let rootPath: string;
let contentPath: string;

async function git(args: Array<string>, date?: string) {
	await readChild(['git', ...args], {
		cwd: contentPath,
		env: {
			GIT_AUTHOR_EMAIL: 'test@example.com',
			GIT_AUTHOR_NAME: 'Test',
			GIT_COMMITTER_EMAIL: 'test@example.com',
			GIT_COMMITTER_NAME: 'Test',
			...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
		},
	});
}

async function commit(file: string, date: string) {
	await fs.mkdir(path.dirname(path.join(contentPath, file)), { recursive: true });
	await fs.writeFile(path.join(contentPath, file), date);
	await git(['add', file]);
	await git(['commit', '--quiet', '-m', file], date);
}

beforeEach(async () => {
	rootPath = await fs.mkdtemp(path.join(tmpdir(), 'commit-dates-'));
	contentPath = path.join(rootPath, 'packages', 'content');
	await fs.mkdir(contentPath, { recursive: true });
	await git(['init', '--quiet']);
	await commit('collections/posts/a.mdx', '2026-01-01T00:00:00Z');
	await commit('collections/posts/b.mdx', '2026-02-01T00:00:00Z');
	await commit('collections/posts/a.mdx', '2026-03-01T00:00:00Z');
});

afterEach(async () => {
	await fs.rm(rootPath, { force: true, recursive: true });
});

describe('getEntryCommitDates', () => {
	test('dates each entry by its last commit, in a repository nested below the root', async () => {
		const dates = await getEntryCommitDates(
			[
				{ filePath: 'packages/content/collections/posts/a.mdx' },
				{ filePath: 'packages/content/collections/posts/b.mdx' },
				{ filePath: 'packages/content/collections/posts/uncommitted.mdx' },
				{},
			],
			{ rootPath },
		);

		expect(dates).toEqual(
			new Map([
				['packages/content/collections/posts/a.mdx', '2026-03-01T00:00:00Z'],
				['packages/content/collections/posts/b.mdx', '2026-02-01T00:00:00Z'],
			]),
		);
	});

	test('dates entries spread across sibling directories', async () => {
		await commit('collections/notes/2026/c.mdx', '2026-04-01T00:00:00Z');
		await commit('readme.md', '2026-05-01T00:00:00Z');

		const dates = await getEntryCommitDates(
			[
				{ filePath: 'packages/content/collections/posts/b.mdx' },
				{ filePath: 'packages/content/collections/notes/2026/c.mdx' },
			],
			{ rootPath },
		);

		expect(dates).toEqual(
			new Map([
				['packages/content/collections/notes/2026/c.mdx', '2026-04-01T00:00:00Z'],
				['packages/content/collections/posts/b.mdx', '2026-02-01T00:00:00Z'],
			]),
		);
	});

	test('dates each entry from the nearest repository when one sits inside another', async () => {
		const outerPath = rootPath;
		const date = '2026-04-01T00:00:00Z';

		contentPath = outerPath;
		await git(['init', '--quiet']);
		await commit('src/pages/about.mdx', date);

		const dates = await getEntryCommitDates(
			[
				{ filePath: 'src/pages/about.mdx' },
				{ filePath: 'packages/content/collections/posts/b.mdx' },
			],
			{ rootPath: outerPath },
		);

		expect(dates).toEqual(
			new Map([
				['packages/content/collections/posts/b.mdx', '2026-02-01T00:00:00Z'],
				['src/pages/about.mdx', date],
			]),
		);
	});

	test('dates paths git would otherwise quote', async () => {
		await commit('collections/posts/café.mdx', '2026-04-01T00:00:00Z');
		await commit('collections/posts/with space.mdx', '2026-05-01T00:00:00Z');
		await commit('collections/posts/with "quote".mdx', '2026-06-01T00:00:00Z');

		const dates = await getEntryCommitDates(
			[
				{ filePath: 'packages/content/collections/posts/café.mdx' },
				{ filePath: 'packages/content/collections/posts/with space.mdx' },
				{ filePath: 'packages/content/collections/posts/with "quote".mdx' },
			],
			{ rootPath },
		);

		expect(dates).toEqual(
			new Map([
				['packages/content/collections/posts/café.mdx', '2026-04-01T00:00:00Z'],
				['packages/content/collections/posts/with "quote".mdx', '2026-06-01T00:00:00Z'],
				['packages/content/collections/posts/with space.mdx', '2026-05-01T00:00:00Z'],
			]),
		);
	});

	test('dates paths by their own commit, not a later merge that lists none', async () => {
		await git(['checkout', '--quiet', '-b', 'side']);
		await commit('collections/posts/side.mdx', '2026-04-01T00:00:00Z');
		await git(['checkout', '--quiet', '-']);
		await commit('collections/posts/main.mdx', '2026-05-01T00:00:00Z');
		await git(['merge', '--quiet', '--no-ff', '-m', 'merge', 'side'], '2026-06-01T00:00:00Z');

		const dates = await getEntryCommitDates(
			[
				{ filePath: 'packages/content/collections/posts/main.mdx' },
				{ filePath: 'packages/content/collections/posts/side.mdx' },
			],
			{ rootPath },
		);

		expect(dates).toEqual(
			new Map([
				['packages/content/collections/posts/main.mdx', '2026-05-01T00:00:00Z'],
				['packages/content/collections/posts/side.mdx', '2026-04-01T00:00:00Z'],
			]),
		);
	});
});
