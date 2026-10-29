import { execFile } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

interface CommitDateReaderOptions {
	date?: 'author' | 'committer';
	onShallow?: 'ignore' | 'throw';
	rootPath: string;
}

interface DatedEntry {
	filePath?: string | undefined;
}

const execFileAsync = promisify(execFile);

const dateMarker = '\u{1}';

const shallowMessage =
	'Shallow clone detected: git history is truncated, so file dates will be missing or wrong. Fetch full history first (`git fetch --unshallow`, or checkout with fetch-depth 0).';

async function readGit(cwd: string, args: Array<string>) {
	const { stdout } = await execFileAsync('git', args, {
		cwd,
		encoding: 'utf8',
		maxBuffer: Infinity,
	});

	return stdout;
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

function parseLog(stdout: string) {
	const dates = new Map<string, string>();
	let currentDate = '';

	for (const token of stdout.split('\0')) {
		let filePath = token;

		if (token.startsWith(dateMarker)) {
			const newline = token.indexOf('\n');

			currentDate = token.slice(dateMarker.length, newline === -1 ? undefined : newline);
			filePath = newline === -1 ? '' : token.slice(newline + 1);
		}

		if (!filePath || !currentDate) continue;
		if (!dates.has(filePath)) dates.set(filePath, currentDate);
	}

	return dates;
}

async function readRepositoryDates(
	repository: string,
	{ date, onShallow }: Required<Omit<CommitDateReaderOptions, 'rootPath'>>,
) {
	if (onShallow === 'throw') {
		const shallow = await readGit(repository, ['rev-parse', '--is-shallow-repository']);

		if (shallow.trim() === 'true') throw new Error(shallowMessage);
	}

	const format = date === 'author' ? '%aI' : '%cI';
	const stdout = await readGit(repository, [
		'log',
		'-z',
		'--name-only',
		`--pretty=format:${dateMarker}${format}`,
	]);

	return parseLog(stdout);
}

export function createCommitDateReader({
	date = 'committer',
	onShallow = 'throw',
	rootPath,
}: CommitDateReaderOptions) {
	const resolvedRoot = realpathSync.native(rootPath);
	const repositories = new Map<string, string | undefined>();
	const repositoryDates = new Map<string, Promise<Map<string, string>>>();

	function getRepositoryDates(repository: string) {
		const cached = repositoryDates.get(repository);

		if (cached) return cached;

		const pending = readRepositoryDates(repository, { date, onShallow });

		repositoryDates.set(repository, pending);

		return pending;
	}

	return async function readCommitDates(entries: Iterable<DatedEntry>) {
		const dates = new Map<string, string>();

		for (const { filePath } of entries) {
			if (!filePath || dates.has(filePath)) continue;

			const absolutePath = path.join(resolvedRoot, filePath);
			const repository = findRepository(path.dirname(absolutePath), repositories);

			if (repository === undefined) continue;

			const repositoryPath = path.relative(repository, absolutePath).split(path.sep).join('/');
			const datesByPath = await getRepositoryDates(repository);
			const commitDate = datesByPath.get(repositoryPath);

			if (commitDate !== undefined) dates.set(filePath, commitDate);
		}

		return dates;
	};
}
