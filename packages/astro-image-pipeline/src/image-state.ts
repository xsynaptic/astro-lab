import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';

import type { ResolvedImageEncoding } from './image-encoding.js';
import type { OpenGraphCard } from './open-graph-cards.js';

import { readDirectoryIfExists, readFileIfExists, writeFileAtomic } from './files.js';
import { UserError } from './user-error.js';

const imageManifestExtension = '.json.gz';
const imageBuildIdFile = 'image-build-id.txt';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const imageManifestVersion = 6;

export interface ImageManifest {
	buildId: string;
	encoding: ResolvedImageEncoding;
	limitInputPixels: number;
	mediaPath: string;
	openGraphCards: Record<string, OpenGraphCard>;
	renditions: Record<string, string>;
	version: typeof imageManifestVersion;
}

export interface ImageRenderTarget {
	cachePath: string;
	distPath: string;
}

export interface ImageBuild {
	buildId: string;
	writtenAt: Date;
}

export function getImageCachePaths(cachePath: string) {
	return {
		devPath: path.join(cachePath, 'dev'),
		manifestsPath: path.join(cachePath, 'manifests'),
		openGraphCardsPath: path.join(cachePath, 'cards'),
		recordsPath: path.join(cachePath, 'records'),
		renditionsPath: path.join(cachePath, 'renditions'),
	};
}

function getManifestPath(cachePath: string, buildId: string) {
	return path.join(
		getImageCachePaths(cachePath).manifestsPath,
		`${buildId}${imageManifestExtension}`,
	);
}

function isCurrentManifest(manifest: { version?: number }): manifest is ImageManifest {
	return manifest.version === imageManifestVersion;
}

async function readImageManifest(cachePath: string, buildId: string) {
	const manifestPath = getManifestPath(cachePath, buildId);
	const data = await readFileIfExists(manifestPath);

	if (!data) return;

	const json = await gunzipAsync(data);
	const manifest = JSON.parse(json.toString('utf8')) as { version?: number };

	if (!isCurrentManifest(manifest)) {
		throw new UserError(
			`The image manifest ${manifestPath} is version ${String(manifest.version ?? 1)}, not ${String(imageManifestVersion)}; rebuild first`,
		);
	}

	return manifest;
}

export async function writeImageManifest(cachePath: string, manifest: ImageManifest) {
	await writeFileAtomic(
		getManifestPath(cachePath, manifest.buildId),
		await gzipAsync(JSON.stringify(manifest)),
	);
}

export async function listImageBuilds(cachePath: string) {
	const { manifestsPath } = getImageCachePaths(path.resolve(cachePath));
	const entries = await readDirectoryIfExists(manifestsPath);
	const builds = await Promise.all(
		entries
			.filter((entry) => entry.endsWith(imageManifestExtension))
			.map(async (entry): Promise<ImageBuild> => {
				const { mtime } = await fs.stat(path.join(manifestsPath, entry));

				return { buildId: entry.slice(0, -imageManifestExtension.length), writtenAt: mtime };
			}),
	);

	return builds.toSorted((first, second) => second.writtenAt.getTime() - first.writtenAt.getTime());
}

export async function readLatestManifest(cachePath: string) {
	const [latest] = await listImageBuilds(cachePath);

	if (!latest) return;

	return readImageManifest(path.resolve(cachePath), latest.buildId);
}

async function readBuildId(distPath: string) {
	const data = await readFileIfExists(path.join(distPath, imageBuildIdFile));

	return data?.toString('utf8').trim();
}

export async function writeBuildId(distPath: string, buildId: string) {
	await fs.writeFile(path.join(distPath, imageBuildIdFile), buildId);
}

export async function readBuildManifest(cachePath: string, buildId: string) {
	const manifest = await readImageManifest(path.resolve(cachePath), buildId);

	if (!manifest) throw new UserError(`No image manifest for build ${buildId} in ${cachePath}`);

	return manifest;
}

export async function dropImageManifests(cachePath: string, buildIds: ReadonlyArray<string>) {
	await Promise.all(buildIds.map((buildId) => fs.rm(getManifestPath(cachePath, buildId))));
}

export async function findDistManifest({ cachePath, distPath }: ImageRenderTarget) {
	const buildId = await readBuildId(distPath);

	if (!buildId) return;

	return readImageManifest(path.resolve(cachePath), buildId);
}

export async function readDistManifest({ cachePath, distPath }: ImageRenderTarget) {
	const buildId = await readBuildId(distPath);

	if (!buildId) throw new UserError(`${distPath} has no ${imageBuildIdFile}; build first`);

	const manifest = await readImageManifest(path.resolve(cachePath), buildId);

	if (!manifest) {
		throw new UserError(
			`No image manifest for build ${buildId} (from ${distPath}) in ${cachePath}; rebuild first`,
		);
	}

	return manifest;
}
