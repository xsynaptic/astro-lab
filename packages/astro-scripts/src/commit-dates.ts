import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

import type { ContentEntry } from './astro.js';

import { readChild } from './child.js';
import { log } from './output/output.js';

interface EntryCommitDatesOptions {
	date?: 'author' | 'committer';
	onShallow?: 'ignore' | 'throw' | 'warn';
	rootPath: string;
}

const dateMarker = '\u{1}';

const shallowMessage =
	'Shallow clone detected: git history is truncated, so file dates will be missing or wrong. Fetch full history first (`git fetch --unshallow`, or checkout with fetch-depth 0).';

async function readGit(cwd: string, args: Array<string>) {
	const { stdout } = await readChild(['git', ...args], { cwd });

	return stdout.trim();
}

function findRepository(
	directory: string,
	repositories: Map<string, string | undefined>,
): string | undefined {
	if (repositories.has(directory)) return repositories.get(directory);

	const parent = path.dirname(directory);
	let repository: string | undefined;

	if (existsSync(path.join(directory, '.git'))) {
		repository = directory;
	} else if (parent !== directory) {
		repository = findRepository(parent, repositories);
	}

	repositories.set(directory, repository);

	return repository;
}

function groupByRepository(directories: ReadonlySet<string>) {
	const repositories = new Map<string, string | undefined>();
	const directoriesByRepository = new Map<string, Array<string>>();

	for (const directory of directories) {
		const repository = findRepository(directory, repositories);

		if (repository === undefined) continue;

		const grouped = directoriesByRepository.get(repository) ?? [];

		grouped.push(directory);
		directoriesByRepository.set(repository, grouped);
	}

	return directoriesByRepository;
}

function findCommonDirectory(repository: string, directories: ReadonlyArray<string>) {
	const [first = [], ...rest] = directories.map((directory) =>
		path.relative(repository, directory).split(path.sep),
	);
	let length = first.length;

	for (const segments of rest) {
		let index = 0;

		while (index < length && segments[index] === first[index]) index++;

		length = index;
	}

	return first.slice(0, length).join(path.sep) || '.';
}

async function checkShallow(repository: string, onShallow: EntryCommitDatesOptions['onShallow']) {
	if (onShallow === 'ignore') return;

	if ((await readGit(repository, ['rev-parse', '--is-shallow-repository'])) !== 'true') return;

	if (onShallow === 'warn') {
		log.warn(shallowMessage);
		return;
	}

	throw new Error(shallowMessage);
}

function parseLog(
	stdout: string,
	repository: string,
	rootPath: string,
	dates: Map<string, string>,
) {
	let currentDate = '';

	for (const token of stdout.split('\0')) {
		let filePath = token;

		if (token.startsWith(dateMarker)) {
			const newline = token.indexOf('\n');

			currentDate = token.slice(dateMarker.length, newline === -1 ? undefined : newline);
			filePath = newline === -1 ? '' : token.slice(newline + 1);
		}

		if (!filePath || !currentDate) continue;

		const relativePath = path
			.relative(rootPath, path.join(repository, filePath))
			.split(path.sep)
			.join('/');

		if (!dates.has(relativePath)) dates.set(relativePath, currentDate);
	}
}

export async function getEntryCommitDates(
	entries: ReadonlyArray<Pick<ContentEntry, 'filePath'>>,
	{ date = 'committer', onShallow = 'throw', rootPath }: EntryCommitDatesOptions,
) {
	const resolvedRoot = realpathSync.native(rootPath);
	const filePaths = new Set(entries.flatMap(({ filePath }) => (filePath ? [filePath] : [])));
	const directories = new Set(
		[...filePaths].map((filePath) => path.dirname(path.join(resolvedRoot, filePath))),
	);
	const dates = new Map<string, string>();
	const format = date === 'author' ? '%aI' : '%cI';

	const directoriesByRepository = groupByRepository(directories);

	for (const [repository, repositoryDirectories] of directoriesByRepository) {
		await checkShallow(repository, onShallow);

		const stdout = await readGit(repository, [
			'log',
			'-z',
			'--name-only',
			`--pretty=format:${dateMarker}${format}`,
			'--',
			findCommonDirectory(repository, repositoryDirectories),
		]);

		parseLog(stdout, repository, resolvedRoot, dates);
	}

	return new Map([...dates].filter(([filePath]) => filePaths.has(filePath)));
}
