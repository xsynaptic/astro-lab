import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';

import type { Card } from './card-name.js';
import type { ResolvedImageEncoding } from './image-encoding.js';

import { readDirectoryIfExists, readFileIfExists, writeFileAtomic } from './files.js';
import { UserError } from './user-error.js';

const imageManifestExtension = '.json.gz';
export const imageBuildIdFile = 'image-build-id.txt';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const imageManifestVersion = 7;

export interface ImageManifest {
	buildId: string;
	cards: Record<string, Card>;
	encoding: ResolvedImageEncoding;
	limitInputPixels: number;
	mediaPath: string;
	renditions: Record<string, string>;
	version: typeof imageManifestVersion;
}

export interface ImageRenderTarget {
	distPath: string;
	storePath: string;
}

export interface ImageBuild {
	buildId: string;
	writtenAt: Date;
}

export function getStoreLayout(storePath: string) {
	return {
		cardsPath: path.join(storePath, 'cards'),
		devPath: path.join(storePath, 'dev'),
		manifestsPath: path.join(storePath, 'manifests'),
		placeholdersPath: path.join(storePath, 'placeholders.sqlite'),
		recordsPath: path.join(storePath, 'records'),
		renditionsPath: path.join(storePath, 'renditions'),
	};
}

export function getImageStorePaths(storePath: string) {
	const { cardsPath, renditionsPath } = getStoreLayout(storePath);

	return { cardsPath, renditionsPath };
}

function getManifestPath(storePath: string, buildId: string) {
	return path.join(getStoreLayout(storePath).manifestsPath, `${buildId}${imageManifestExtension}`);
}

function isCurrentManifest(manifest: { version?: number }): manifest is ImageManifest {
	return manifest.version === imageManifestVersion;
}

async function readManifestFile(manifestPath: string) {
	const data = await readFileIfExists(manifestPath);

	if (!data) return;

	const json = await gunzipAsync(data);

	return JSON.parse(json.toString('utf8')) as Partial<
		Pick<ImageManifest, 'cards' | 'mediaPath' | 'renditions'>
	> & { version?: number };
}

async function readImageManifest(storePath: string, buildId: string) {
	const manifestPath = getManifestPath(storePath, buildId);
	const manifest = await readManifestFile(manifestPath);

	if (!manifest) return;

	if (!isCurrentManifest(manifest)) {
		throw new UserError(
			`The image manifest ${manifestPath} is version ${String(manifest.version ?? 1)}, not ${String(imageManifestVersion)}; rebuild first`,
		);
	}

	return manifest;
}

export async function writeImageManifest(storePath: string, manifest: ImageManifest) {
	await writeFileAtomic(
		getManifestPath(storePath, manifest.buildId),
		await gzipAsync(JSON.stringify(manifest)),
	);
}

export async function listImageBuilds(storePath: string) {
	const { manifestsPath } = getStoreLayout(path.resolve(storePath));
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

export async function readLatestManifest(storePath: string) {
	const [latest] = await listImageBuilds(storePath);

	if (!latest) return;

	return readImageManifest(path.resolve(storePath), latest.buildId);
}

async function readBuildId(distPath: string) {
	const data = await readFileIfExists(path.join(distPath, imageBuildIdFile));

	return data?.toString('utf8').trim();
}

export async function writeBuildId(distPath: string, buildId: string) {
	await fs.writeFile(path.join(distPath, imageBuildIdFile), buildId);
}

export async function readBuildNames(storePath: string, buildId: string) {
	const manifestPath = getManifestPath(storePath, buildId);
	const manifest = await readManifestFile(manifestPath);

	if (!manifest) throw new UserError(`No image manifest for build ${buildId} in ${storePath}`);

	if (!manifest.renditions || manifest.mediaPath === undefined) {
		throw new UserError(`The image manifest ${manifestPath} lists no renditions; rebuild first`);
	}

	return {
		cards: Object.keys(manifest.cards ?? {}),
		mediaPath: manifest.mediaPath,
		renditions: manifest.renditions,
	};
}

export async function dropImageManifests(storePath: string, buildIds: ReadonlyArray<string>) {
	await Promise.all(buildIds.map((buildId) => fs.rm(getManifestPath(storePath, buildId))));
}

export async function findDistManifest({ distPath, storePath }: ImageRenderTarget) {
	const buildId = await readBuildId(distPath);

	if (!buildId) return;

	return readImageManifest(path.resolve(storePath), buildId);
}

export async function readDistManifest({ distPath, storePath }: ImageRenderTarget) {
	const buildId = await readBuildId(distPath);

	if (!buildId) throw new UserError(`${distPath} has no ${imageBuildIdFile}; build first`);

	const manifest = await readImageManifest(path.resolve(storePath), buildId);

	if (!manifest) {
		throw new UserError(
			`No image manifest for build ${buildId} (from ${distPath}) in ${storePath}; rebuild first`,
		);
	}

	return manifest;
}
