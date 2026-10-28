import { promises as fs } from 'node:fs';
import path from 'node:path';

import { pruneFileCache } from './file-cache.js';
import { readDirectoryTreeIfExists, statIfExists } from './files.js';
import {
	dropImageManifests,
	getImageCachePaths,
	listImageBuilds,
	readBuildManifest,
} from './image-state.js';
import { withRenderLock } from './render-lock.js';
import { UserError } from './user-error.js';

export interface ImageSweepOptions {
	cachePath: string;
	keep: ReadonlyArray<string>;
}

export interface ImageSweepFile {
	name: string;
	size: number;
}

async function resolveKeep(cachePath: string, keep: ReadonlyArray<string>) {
	const [newest] = await listImageBuilds(cachePath);
	const buildIds = new Set(keep);

	if (newest) buildIds.add(newest.buildId);

	if (buildIds.size === 0) throw new UserError(`${cachePath} has no image builds to keep`);

	const manifests = await Promise.all(
		[...buildIds].map((buildId) => readBuildManifest(cachePath, buildId)),
	);
	const names = new Set(manifests.flatMap((manifest) => Object.keys(manifest.renditions)));

	return { buildIds, names };
}

function isSwept(name: string, keep: ReadonlySet<string>) {
	return name.endsWith('.tmp') || !keep.has(name);
}

async function listFiles(directory: string) {
	const entries = await readDirectoryTreeIfExists(directory);

	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)));
}

async function removeEmptyDirectories(directory: string) {
	const entries = await readDirectoryTreeIfExists(directory);
	const directories = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.join(entry.parentPath, entry.name))
		.toSorted((first, second) => second.length - first.length);

	for (const directoryPath of directories) {
		const remaining = await fs.readdir(directoryPath);

		if (remaining.length === 0) await fs.rmdir(directoryPath);
	}
}

export async function prepareImageSweep({ cachePath, keep }: ImageSweepOptions) {
	const resolvedCachePath = path.resolve(cachePath);
	const { renditionsPath } = getImageCachePaths(resolvedCachePath);
	const kept = await resolveKeep(resolvedCachePath, keep);
	const names = await listFiles(renditionsPath);
	const sizes = await Promise.all(
		names
			.filter((name) => isSwept(name, kept.names))
			.map(async (name) => {
				const stats = await statIfExists(path.join(renditionsPath, name));

				return stats ? [{ name, size: stats.size }] : [];
			}),
	);
	const deletions: ReadonlyArray<ImageSweepFile> = sizes.flat();

	function run() {
		return withRenderLock(renditionsPath, async () => {
			const current = await resolveKeep(resolvedCachePath, keep);
			const removed = deletions.filter((file) => isSwept(file.name, current.names));

			await Promise.all(
				removed.map((file) => fs.rm(path.join(renditionsPath, file.name), { force: true })),
			);
			await removeEmptyDirectories(renditionsPath);
			await pruneFileCache(renditionsPath, current.names);

			const droppedBuilds = await dropImageManifests(resolvedCachePath, current.buildIds);

			return { deletions: removed, droppedBuilds };
		});
	}

	return { deletions, keep: kept.names, run, total: names.length };
}
