import type { OutputInfo } from 'sharp';

import { promises as fs } from 'node:fs';
import path from 'node:path';
import pLimit from 'p-limit';
import sharp from 'sharp';

import type { ImageFormat, ImageName } from './image-name.js';
import type { ImageManifest, ImageRenderTarget } from './image-state.js';
import type { RenderJobOptions } from './run-render-jobs.js';
import type { SourceFingerprints } from './source-fingerprints.js';

import { formatList } from './format.js';
import { imageRenderRevision, serializeEncoding } from './image-encoding.js';
import { parseImageName } from './image-name.js';
import { engineId, renderImage } from './image-render.js';
import { isWithinSource } from './image-sizes.js';
import { getImageCachePaths, readDistManifest } from './image-state.js';
import { hashRenderKey } from './render-key.js';
import { getDefaultConcurrency, runRenderJobs } from './run-render-jobs.js';
import { createSourceFingerprints } from './source-fingerprints.js';
import { UserError } from './user-error.js';

export type ImageRenderRunOptions = Pick<
	RenderJobOptions,
	'onFailure' | 'onProgress' | 'onReplace' | 'signal'
>;

interface ImageRendition extends ImageName {
	name: string;
	sourcePath: string;
}

function sortNames(names: ReadonlyArray<string>) {
	return names.toSorted((first, second) => first.localeCompare(second));
}

export function getRenditionKey({
	digest,
	encoding,
	engine,
	format,
	height,
	width,
}: {
	digest: string;
	encoding: ImageManifest['encoding'][ImageFormat];
	engine: string;
	format: ImageFormat;
	height?: number | undefined;
	width: number;
}) {
	return hashRenderKey([
		digest,
		format,
		serializeEncoding(encoding),
		width,
		height ?? '',
		imageRenderRevision,
		engine,
	]);
}

function getManifestRenditions(manifest: ImageManifest) {
	const renditions: Array<ImageRendition> = [];
	const invalid: Array<string> = [];

	for (const [name, sourcePath] of Object.entries(manifest.renditions)) {
		const parsed = parseImageName(name);

		if (parsed) {
			renditions.push({ ...parsed, name, sourcePath });
		} else {
			invalid.push(name);
		}
	}

	if (invalid.length > 0) {
		throw new UserError(
			`${String(invalid.length)} manifest names are outside the grammar; rebuild first:\n${formatList(sortNames(invalid))}`,
		);
	}

	return renditions;
}

async function readSourceDigests(
	fingerprints: SourceFingerprints,
	{ mediaPath }: ImageManifest,
	{ concurrency, renditions }: { concurrency: number; renditions: ReadonlyArray<ImageRendition> },
) {
	const limit = pLimit(concurrency);
	const digests = new Map<string, string>();
	const vanished: Array<string> = [];
	const upscaled: Array<string> = [];
	const renditionsBySource = Map.groupBy(renditions, (rendition) => rendition.sourcePath);

	await Promise.all(
		[...renditionsBySource].map(([sourcePath, sourceRenditions]) =>
			limit(async () => {
				const fingerprint = await fingerprints.get(path.resolve(mediaPath, sourcePath));

				if (!fingerprint) {
					vanished.push(sourcePath);
					return;
				}

				for (const rendition of sourceRenditions) {
					if (!isWithinSource(rendition, fingerprint)) {
						upscaled.push(
							`${rendition.name} (source ${String(fingerprint.width)}x${String(fingerprint.height)})`,
						);
					}
				}

				digests.set(sourcePath, fingerprint.sha256);
			}),
		),
	);

	if (vanished.length > 0) {
		throw new UserError(
			`${String(vanished.length)} sources vanished since the build; rebuild first:\n${formatList(sortNames(vanished))}`,
		);
	}

	if (upscaled.length > 0) {
		throw new UserError(
			`${String(upscaled.length)} renditions are larger than their source; rebuild first:\n${formatList(sortNames(upscaled))}`,
		);
	}

	return digests;
}

function assertEncodedSize(rendition: ImageRendition, info: OutputInfo) {
	if (info.width === rendition.width && (rendition.height ?? info.height) === info.height) return;

	throw new Error(`encoded ${String(info.width)}x${String(info.height)}`);
}

function getManifestRenditionKey(
	rendition: ImageRendition,
	manifest: ImageManifest,
	digests: ReadonlyMap<string, string>,
) {
	const digest = digests.get(rendition.sourcePath);

	if (!digest) throw new Error(`no digest was read for source ${rendition.sourcePath}`);

	return getRenditionKey({
		digest,
		encoding: manifest.encoding[rendition.format],
		engine: engineId,
		format: rendition.format,
		height: rendition.height,
		width: rendition.width,
	});
}

async function encodeRendition(rendition: ImageRendition, manifest: ImageManifest) {
	const { data, info } = await renderImage(path.resolve(manifest.mediaPath, rendition.sourcePath), {
		encoding: manifest.encoding,
		format: rendition.format,
		height: rendition.height,
		limitInputPixels: manifest.limitInputPixels,
		width: rendition.width,
	});

	assertEncodedSize(rendition, info);

	return data;
}

async function readImageJobs({ cachePath, distPath }: ImageRenderTarget, concurrency: number) {
	const { renditionsPath } = getImageCachePaths(cachePath);
	const manifest = await readDistManifest({ cachePath, distPath });
	const renditions = getManifestRenditions(manifest);
	const fingerprints = createSourceFingerprints(cachePath);

	try {
		const digests = await readSourceDigests(fingerprints, manifest, { concurrency, renditions });
		const jobs = renditions.map((rendition) => ({
			key: getManifestRenditionKey(rendition, manifest, digests),
			name: rendition.name,
			render: () => encodeRendition(rendition, manifest),
		}));

		return { directory: renditionsPath, jobs };
	} finally {
		fingerprints.close();
	}
}

export async function prepareImageRender({ cachePath, distPath }: ImageRenderTarget) {
	const resolvedCachePath = path.resolve(cachePath);
	const concurrency = getDefaultConcurrency();
	const { directory, jobs } = await readImageJobs(
		{ cachePath: resolvedCachePath, distPath },
		concurrency,
	);

	async function run(options: ImageRenderRunOptions = {}) {
		// Process-wide; the job pool supplies the parallelism instead of libvips threads
		sharp.concurrency(1);
		sharp.cache(false);

		const counts = await runRenderJobs({ ...options, concurrency, directory, jobs });

		// Dev serves built renditions first, so its own renders are redundant now
		await fs.rm(getImageCachePaths(resolvedCachePath).devPath, { force: true, recursive: true });

		return counts;
	}

	return { run, total: jobs.length };
}
