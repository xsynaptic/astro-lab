import { realpathSync } from 'node:fs';
import path from 'node:path';

import type { ContentEntry } from './astro.js';

import { readChild } from './child.js';
import { log } from './output/output.js';

interface EntryCommitDatesOptions {
	date?: 'author' | 'committer';
	onShallow?: 'ignore' | 'throw' | 'warn';
	rootPath: string;
}

const dateLineMarker = '\u{1}';

const shallowMessage =
	'Shallow clone detected: git history is truncated, so file dates will be missing or wrong. Fetch full history first (`git fetch --unshallow`, or checkout with fetch-depth 0).';

async function readGit(cwd: string, args: Array<string>) {
	const { stdout } = await readChild(['git', ...args], { cwd });

	return stdout.trim();
}

async function findRepository(directory: string) {
	try {
		const { exitCode, stdout } = await readChild(['git', 'rev-parse', '--show-toplevel'], {
			allowFailure: true,
			cwd: directory,
		});

		return exitCode === 0 ? stdout.trim() : undefined;
	} catch {
		return;
	}
}

async function groupByRepository(directories: ReadonlySet<string>) {
	const directoriesByRepository = new Map<string, Array<string>>();

	for (const directory of directories) {
		const repository = await findRepository(directory);

		if (repository === undefined) continue;

		const grouped = directoriesByRepository.get(repository) ?? [];

		grouped.push(directory);
		directoriesByRepository.set(repository, grouped);
	}

	return directoriesByRepository;
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

	for (const line of stdout.split('\n')) {
		if (line.startsWith(dateLineMarker)) {
			currentDate = line.slice(dateLineMarker.length);
			continue;
		}

		if (!line || !currentDate) continue;

		const filePath = path.relative(rootPath, path.join(repository, line)).split(path.sep).join('/');

		if (!dates.has(filePath)) dates.set(filePath, currentDate);
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

	const directoriesByRepository = await groupByRepository(directories);

	for (const [repository, repositoryDirectories] of directoriesByRepository) {
		await checkShallow(repository, onShallow);

		const stdout = await readGit(repository, [
			'log',
			'--name-only',
			`--pretty=format:${dateLineMarker}${format}`,
			'--',
			...repositoryDirectories.map((directory) => path.relative(repository, directory) || '.'),
		]);

		parseLog(stdout, repository, resolvedRoot, dates);
	}

	return new Map([...dates].filter(([filePath]) => filePaths.has(filePath)));
}
