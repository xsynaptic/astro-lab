import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

import { readFileIfExists, readJsonFile, writeJsonFile } from './files.js';

interface FileCacheRecord {
	key: string;
}

// Renaming `files` would orphan every recorded key and re-render the whole library
interface RenderKeys {
	files: Record<string, FileCacheRecord>;
}

function getKeysPath(directory: string) {
	return `${directory}-keys.json`;
}

async function readRenderKeys(directory: string) {
	const stored = await readJsonFile<RenderKeys>(getKeysPath(directory));

	return new Map(Object.entries(stored?.files ?? {}));
}

async function writeRenderKeys(directory: string, records: ReadonlyMap<string, FileCacheRecord>) {
	await writeJsonFile(getKeysPath(directory), {
		files: Object.fromEntries(
			[...records].toSorted(([first], [second]) => first.localeCompare(second)),
		),
	} satisfies RenderKeys);
}

export async function pruneFileCache(directory: string, names: ReadonlySet<string>) {
	const records = await readRenderKeys(directory);
	const stale = [...records.keys()].filter((name) => !names.has(name));

	if (stale.length === 0) return;

	for (const name of stale) records.delete(name);

	await writeRenderKeys(directory, records);
}

export async function createFileCache({
	directory,
	onReplace,
}: {
	directory: string;
	onReplace?: (name: string) => Promise<void>;
}) {
	const records = await readRenderKeys(directory);

	function filePath(name: string) {
		return path.join(directory, name);
	}

	return {
		isFresh(name: string, key: string) {
			return records.get(name)?.key === key && existsSync(filePath(name));
		},

		async save() {
			await writeRenderKeys(directory, records);
		},

		// Identical bytes keep the old file and its mtime, so rsync has nothing to send
		async write(name: string, key: string, data: Uint8Array) {
			const target = filePath(name);
			const existing = await readFileIfExists(target);
			const isChanged = !existing?.equals(data);

			if (isChanged) {
				const temporary = `${target}.tmp`;

				await fs.mkdir(path.dirname(target), { recursive: true });
				await fs.writeFile(temporary, data);
				if (existing) await onReplace?.(name);
				await fs.rename(temporary, target);
			}

			records.set(name, { key });

			return isChanged;
		},
	};
}
