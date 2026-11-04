import type { Stats } from 'node:fs';

import { promises as fs, statSync } from 'node:fs';
import path from 'node:path';

import { readFileIfExists, readJsonFile, writeJsonFile } from './files.js';

interface FileSource {
	digest: string;
	path: string;
}

export interface FileRecord {
	key: string;
	mtimeMs?: number;
	namedAt?: string;
	size?: number;
	source?: FileSource;
}

export interface StoredFile {
	key: string;
	name: string;
	source?: FileSource;
}

// Renaming `files` would orphan every recorded key and re-render the whole library
interface FileRecords {
	files: Record<string, FileRecord>;
}

function getRecordsPath(directory: string) {
	return `${directory}-keys.json`;
}

export async function readFileRecords(directory: string) {
	const stored = await readJsonFile<FileRecords>(getRecordsPath(directory));

	return new Map(Object.entries(stored?.files ?? {}));
}

export async function writeFileRecords(
	directory: string,
	records: ReadonlyMap<string, FileRecord>,
) {
	await writeJsonFile(getRecordsPath(directory), {
		files: Object.fromEntries(
			[...records].toSorted(([first], [second]) => first.localeCompare(second)),
		),
	} satisfies FileRecords);
}

export async function createFileStore({
	directory,
	onReplace,
}: {
	directory: string;
	onReplace?: (name: string) => Promise<void>;
}) {
	const records = await readFileRecords(directory);

	function filePath(name: string) {
		return path.join(directory, name);
	}

	function record(
		{ key, name, source }: StoredFile,
		{ mtimeMs, size }: Pick<Stats, 'mtimeMs' | 'size'>,
	) {
		const next: FileRecord = { key, mtimeMs, size };
		const namedAt = records.get(name)?.namedAt;

		if (namedAt !== undefined) next.namedAt = namedAt;

		if (source) next.source = source;

		records.set(name, next);
	}

	return {
		keepIfFresh(file: StoredFile) {
			const recorded = records.get(file.name);

			if (recorded?.key !== file.key) return false;

			const stats = statSync(filePath(file.name), { throwIfNoEntry: false });

			if (!stats || stats.size !== recorded.size || stats.mtimeMs !== recorded.mtimeMs)
				return false;

			record(file, stats);

			return true;
		},

		async save() {
			await writeFileRecords(directory, records);
		},

		// Identical bytes keep the old file and its mtime, so rsync has nothing to send
		async write(file: StoredFile, data: Uint8Array) {
			const target = filePath(file.name);
			const existing = await readFileIfExists(target);
			const isChanged = !existing?.equals(data);

			if (isChanged) {
				const temporary = `${target}.tmp`;

				await fs.mkdir(path.dirname(target), { recursive: true });
				await fs.writeFile(temporary, data);
				if (existing) await onReplace?.(file.name);
				await fs.rename(temporary, target);
			}

			record(file, await fs.stat(target));

			return isChanged;
		},
	};
}
