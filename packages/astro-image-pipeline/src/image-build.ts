import type { OutputInfo } from 'sharp';

import { promises as fs } from 'node:fs';
import path from 'node:path';
import pLimit from 'p-limit';

import type { ImageFormat } from './image-formats.js';
import type { RenditionName } from './image-name.js';
import type { ImageManifest, ImageRenderTarget } from './image-state.js';
import type { RenderJob, RenderJobOptions } from './run-render-jobs.js';
import type { SourceFingerprints } from './source-fingerprints.js';

import { formatList } from './format.js';
import { imageRenderRevision, serializeEncoding } from './image-encoding.js';
import { parseRenditionName } from './image-name.js';
import { configureEngineForJobPool, engineId, renderImage } from './image-render.js';
import { isWithinSource } from './image-sizes.js';
import { getStoreLayout, readDistManifest } from './image-state.js';
import { hashRenderKey } from './render-key.js';
import { getDefaultConcurrency, runRenderJobs } from './run-render-jobs.js';
import { createSourceFingerprints } from './source-fingerprints.js';
import { UserError } from './user-error.js';

export type RenditionRenderRunOptions = Pick<
	RenderJobOptions,
	'concurrency' | 'onFailure' | 'onProgress' | 'onReplace' | 'signal'
>;

interface ImageRendition extends RenditionName {
	name: string;
	sourcePath: string;
}

function sortNames(names: ReadonlyArray<string>) {
	return names.toSorted((first, second) => first.localeCompare(second));
}

interface SourceState {
	digest: string;
	pages: number;
}

export function getRenditionKey({
	digest,
	encoding,
	engine,
	format,
	height,
	keepIccProfile = false,
	pages = 1,
	width,
}: {
	digest: string;
	encoding: ImageManifest['encoding'][ImageFormat];
	engine: string;
	format: ImageFormat;
	height?: number | undefined;
	keepIccProfile?: boolean;
	pages?: number;
	width: number;
}) {
	const parts = [
		digest,
		format,
		serializeEncoding(encoding),
		width,
		height ?? '',
		imageRenderRevision,
		engine,
	];

	if (pages > 1) parts.push(`pages=${String(pages)}`);

	if (keepIccProfile) parts.push('icc');

	return hashRenderKey(parts);
}

function getManifestRenditions(manifest: ImageManifest) {
	const renditions: Array<ImageRendition> = [];
	const invalid: Array<string> = [];

	for (const [name, sourcePath] of Object.entries(manifest.renditions)) {
		const parsed = parseRenditionName(name);

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

async function readSourceStates(
	fingerprints: SourceFingerprints,
	{ mediaPath }: ImageManifest,
	{ concurrency, renditions }: { concurrency: number; renditions: ReadonlyArray<ImageRendition> },
) {
	const limit = pLimit(concurrency);
	const states = new Map<string, SourceState>();
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

				states.set(sourcePath, { digest: fingerprint.sha256, pages: fingerprint.pages });
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

	return states;
}

function assertEncodedSize(rendition: ImageRendition, info: OutputInfo) {
	const height = info.pageHeight ?? info.height;

	if (info.width === rendition.width && (rendition.height ?? height) === height) return;

	throw new Error(`encoded ${String(info.width)}x${String(height)}`);
}

function createRenditionJob(
	rendition: ImageRendition,
	manifest: ImageManifest,
	states: ReadonlyMap<string, SourceState>,
): RenderJob {
	const state = states.get(rendition.sourcePath);

	if (!state) throw new Error(`no digest was read for source ${rendition.sourcePath}`);

	const key = getRenditionKey({
		digest: state.digest,
		encoding: manifest.encoding[rendition.format],
		engine: engineId,
		format: rendition.format,
		height: rendition.height,
		keepIccProfile: manifest.keepIccProfile,
		pages: state.pages,
		width: rendition.width,
	});

	return {
		key,
		name: rendition.name,
		render: () => encodeRendition(rendition, manifest, state.pages),
		source: { digest: state.digest, path: rendition.sourcePath },
	};
}

async function encodeRendition(rendition: ImageRendition, manifest: ImageManifest, pages: number) {
	const { data, info } = await renderImage(path.resolve(manifest.mediaPath, rendition.sourcePath), {
		encoding: manifest.encoding,
		format: rendition.format,
		height: rendition.height,
		keepIccProfile: manifest.keepIccProfile,
		limitInputPixels: manifest.limitInputPixels,
		pages,
		width: rendition.width,
	});

	assertEncodedSize(rendition, info);

	return data;
}

async function readImageJobs({ distPath, storePath }: ImageRenderTarget, concurrency: number) {
	const { renditionsPath } = getStoreLayout(storePath);
	const manifest = await readDistManifest({ distPath, storePath });
	const renditions = getManifestRenditions(manifest);
	const fingerprints = createSourceFingerprints(storePath);

	try {
		const states = await readSourceStates(fingerprints, manifest, { concurrency, renditions });
		const jobs = renditions.map((rendition) => createRenditionJob(rendition, manifest, states));

		return { directory: renditionsPath, jobs };
	} finally {
		fingerprints.close();
	}
}

export async function prepareRenditionRender({ distPath, storePath }: ImageRenderTarget) {
	const resolvedStorePath = path.resolve(storePath);
	const concurrency = getDefaultConcurrency();
	const { directory, jobs } = await readImageJobs(
		{ distPath, storePath: resolvedStorePath },
		concurrency,
	);

	async function run({
		concurrency: runConcurrency = concurrency,
		...options
	}: RenditionRenderRunOptions = {}) {
		configureEngineForJobPool();

		const counts = await runRenderJobs({
			...options,
			concurrency: runConcurrency,
			directory,
			jobs,
		});

		// Dev serves built renditions first, so its own renders are redundant now
		await fs.rm(getStoreLayout(resolvedStorePath).devPath, { force: true, recursive: true });

		return counts;
	}

	return { directory, run, total: jobs.length };
}

export type PreparedRenditionRender = Awaited<ReturnType<typeof prepareRenditionRender>>;
