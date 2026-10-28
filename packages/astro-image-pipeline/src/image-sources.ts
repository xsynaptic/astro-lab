import { promises as fs } from 'node:fs';
import path from 'node:path';

import { readDirectoryTreeIfExists } from './files.js';
import { getImageStem, isImageSource } from './image-name.js';

export interface ImageSourceResolver {
	resolve(stem: string): Promise<string | undefined>;
}

async function readDirectory(directory: string) {
	try {
		return await fs.readdir(directory);
	} catch {
		return [];
	}
}

// No directory cache, so files added while dev runs resolve without a restart
export function createDirectorySources(mediaPath: string): ImageSourceResolver {
	return {
		async resolve(stem) {
			const directory = path.posix.dirname(stem);
			const basename = path.posix.basename(stem);
			const entries = await readDirectory(path.join(mediaPath, directory));
			const entry = entries.find((name) => isImageSource(name) && getImageStem(name) === basename);

			return entry === undefined ? undefined : path.posix.join(directory, entry);
		},
	};
}

export async function listImageSources(mediaPath: string) {
	const entries = await readDirectoryTreeIfExists(mediaPath);

	return new Set(
		entries
			.filter((entry) => entry.isFile() && isImageSource(entry.name))
			.map((entry) =>
				path.relative(mediaPath, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'),
			),
	);
}
