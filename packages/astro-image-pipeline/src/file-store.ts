import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

import { readFileIfExists, readJsonFile, writeJsonFile } from './files.js';

interface FileSource {
	digest: string;
	path: string;
}

export interface FileRecord {
	key: string;
	namedAt?: string;
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

	function record({ key, name, source }: StoredFile) {
		const next: FileRecord = { key };
		const namedAt = records.get(name)?.namedAt;

		if (namedAt !== undefined) next.namedAt = namedAt;

		if (source) next.source = source;

		records.set(name, next);
	}

	return {
		isFresh(name: string, key: string) {
			return records.get(name)?.key === key && existsSync(filePath(name));
		},

		record,

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

			record(file);

			return isChanged;
		},
	};
}
