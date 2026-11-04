import { fc, test } from '@fast-check/vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect } from 'vitest';

import { createCommitDateReader } from '../src/commit-dates.js';

const execFileAsync = promisify(execFile);

let rootPath: string;
let contentPath: string;

async function git(args: Array<string>, date?: string) {
	await execFileAsync('git', args, {
		cwd: contentPath,
		env: {
			...process.env,
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

describe('createCommitDateReader', () => {
	test('dates each entry by its last commit, in a repository nested below the root', async () => {
		const dates = await createCommitDateReader({ rootPath })([
			{ filePath: 'packages/content/collections/posts/a.mdx' },
			{ filePath: 'packages/content/collections/posts/b.mdx' },
			{ filePath: 'packages/content/collections/posts/uncommitted.mdx' },
			{},
		]);

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

		const dates = await createCommitDateReader({ rootPath })([
			{ filePath: 'packages/content/collections/posts/b.mdx' },
			{ filePath: 'packages/content/collections/notes/2026/c.mdx' },
		]);

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

		const dates = await createCommitDateReader({ rootPath: outerPath })([
			{ filePath: 'src/pages/about.mdx' },
			{ filePath: 'packages/content/collections/posts/b.mdx' },
		]);

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

		const dates = await createCommitDateReader({ rootPath })([
			{ filePath: 'packages/content/collections/posts/café.mdx' },
			{ filePath: 'packages/content/collections/posts/with space.mdx' },
			{ filePath: 'packages/content/collections/posts/with "quote".mdx' },
		]);

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

		const dates = await createCommitDateReader({ rootPath })([
			{ filePath: 'packages/content/collections/posts/main.mdx' },
			{ filePath: 'packages/content/collections/posts/side.mdx' },
		]);

		expect(dates).toEqual(
			new Map([
				['packages/content/collections/posts/main.mdx', '2026-05-01T00:00:00Z'],
				['packages/content/collections/posts/side.mdx', '2026-04-01T00:00:00Z'],
			]),
		);
	});

	// Lowercase only, so a case-insensitive disk never folds two names into one; convention only
	const pathCharacter = fc.constantFrom('a', 'b', ' ', '"', '\n', '\t', '\u{1}', 'é', '\\', '#');

	const fileName = fc
		.string({ maxLength: 3, minLength: 1, unit: pathCharacter })
		.filter((name) => name !== '.' && name !== '..');

	const filePaths = fc.uniqueArray(
		fc
			.tuple(
				fc.constantFrom('', '', '', 'posts/'),
				fc.oneof(
					fileName,
					fileName.map((name) => `\u{1}${name}`),
				),
			)
			.map(([directory, name]) => directory + name),
		{ maxLength: 4, minLength: 1 },
	);

	const history = filePaths.chain((paths) =>
		fc
			.array(fc.subarray(paths), { maxLength: 4, minLength: 1 })
			.map((commits) => ({ commits, paths })),
	);

	test.prop([history], { numRuns: 30 })(
		'dates each committed path by its newest commit, whatever its name holds',
		async ({ commits, paths }) => {
			const expected = new Map<string, string>();

			await fs.rm(rootPath, { force: true, recursive: true });
			rootPath = await fs.mkdtemp(path.join(tmpdir(), 'commit-dates-'));
			contentPath = path.join(rootPath, 'packages', 'content');
			await fs.mkdir(contentPath, { recursive: true });
			await git(['init', '--quiet']);

			for (const [index, touched] of commits.entries()) {
				const date = `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00Z`;

				for (const filePath of touched) {
					await fs.mkdir(path.dirname(path.join(contentPath, filePath)), { recursive: true });
					await fs.writeFile(path.join(contentPath, filePath), date);
					expected.set(`packages/content/${filePath}`, date);
				}

				await git(['add', '--all']);
				await git(['commit', '--quiet', '--allow-empty', '-m', `commit ${String(index)}`], date);
			}

			const dates = await createCommitDateReader({ rootPath })(
				paths.map((filePath) => ({ filePath: `packages/content/${filePath}` })),
			);

			expect(dates).toStrictEqual(expected);
		},
		60_000,
	);
});
