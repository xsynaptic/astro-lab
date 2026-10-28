import path from 'node:path';

import type { ImageRenderTarget } from './image-state.js';
import type { OpenGraphCard, OpenGraphCardImage, OpenGraphCardInput } from './open-graph-cards.js';
import type { RenderJob, RenderJobOptions } from './run-render-jobs.js';
import type { SourceFingerprints } from './source-fingerprints.js';

import { engineId } from './image-render.js';
import { getImageCachePaths, readDistManifest } from './image-state.js';
import { hashRenderKey } from './render-key.js';
import { runRenderJobs } from './run-render-jobs.js';
import { createSourceFingerprints } from './source-fingerprints.js';

export interface OpenGraphCardSource extends OpenGraphCardImage {
	filePath: string;
}

export type OpenGraphCardRenderRunOptions = Pick<
	RenderJobOptions,
	'concurrency' | 'onFailure' | 'onProgress' | 'onReplace' | 'signal'
>;

type MissingImagePolicy = 'fail' | 'omit';

export interface OpenGraphCardRenderOptions<Decoded> extends ImageRenderTarget {
	decode: (source: OpenGraphCardSource) => Promise<Decoded>;
	missingImage?: MissingImagePolicy;
	render: (input: OpenGraphCardInput, decoded?: Decoded) => Promise<Uint8Array>;
	templateVersion: string;
}

interface OpenGraphCardGroup {
	cards: Array<[name: string, input: OpenGraphCardInput]>;
	image?: OpenGraphCardImage;
}

interface OpenGraphCardSourceState {
	digest?: string;
	source: OpenGraphCardSource;
}

export function getOpenGraphCardKey({
	digest = '',
	engine,
	image,
	input,
	templateVersion,
}: {
	digest?: string | undefined;
	engine: string;
	image?: OpenGraphCardImage | undefined;
	input: OpenGraphCardInput;
	templateVersion: string;
}) {
	return hashRenderKey([
		engine,
		templateVersion,
		JSON.stringify(input),
		image ? JSON.stringify(image) : '',
		digest,
	]);
}

function groupByImage(cards: Record<string, OpenGraphCard>) {
	const groups = new Map<string, OpenGraphCardGroup>();

	for (const [name, { image, input }] of Object.entries(cards)) {
		const groupKey = image ? JSON.stringify(image) : '';
		const group = groups.get(groupKey) ?? (image ? { cards: [], image } : { cards: [] });

		group.cards.push([name, input]);
		groups.set(groupKey, group);
	}

	return [...groups.values()];
}

async function readSourceState(
	fingerprints: SourceFingerprints,
	mediaPath: string,
	image: OpenGraphCardImage,
): Promise<OpenGraphCardSourceState> {
	const source = { ...image, filePath: path.resolve(mediaPath, image.path) };
	const fingerprint = await fingerprints.get(source.filePath);

	return fingerprint ? { digest: fingerprint.sha256, source } : { source };
}

function createGroupDecoder<Decoded>({
	decode,
	missingImage,
}: Pick<OpenGraphCardRenderOptions<Decoded>, 'decode'> & { missingImage: MissingImagePolicy }) {
	let current:
		undefined | { decoded: Promise<Decoded | undefined>; state: OpenGraphCardSourceState };

	function startDecode(state: OpenGraphCardSourceState) {
		if (state.digest) return decode(state.source);

		if (missingImage === 'omit') return Promise.resolve(undefined);

		return Promise.reject(new Error(`Missing image: ${state.source.path}`));
	}

	return function getDecoded(state: OpenGraphCardSourceState) {
		if (current?.state !== state) current = { decoded: startDecode(state), state };

		return current.decoded;
	};
}

async function createCardJobs<Decoded>({
	cachePath,
	decode,
	groups,
	mediaPath,
	missingImage,
	render,
	templateVersion,
}: Pick<OpenGraphCardRenderOptions<Decoded>, 'decode' | 'render' | 'templateVersion'> & {
	cachePath: string;
	groups: ReadonlyArray<OpenGraphCardGroup>;
	mediaPath: string;
	missingImage: MissingImagePolicy;
}) {
	const fingerprints = createSourceFingerprints(cachePath);
	const getDecoded = createGroupDecoder({ decode, missingImage });
	const jobs: Array<RenderJob> = [];
	const missingImages = new Set<string>();

	try {
		for (const { cards, image } of groups) {
			const state = image ? await readSourceState(fingerprints, mediaPath, image) : undefined;

			if (state && !state.digest) missingImages.add(state.source.path);

			for (const [name, input] of cards) {
				jobs.push({
					key: getOpenGraphCardKey({
						digest: state?.digest,
						engine: engineId,
						image,
						input,
						templateVersion,
					}),
					name,
					render: async () => render(input, state ? await getDecoded(state) : undefined),
				});
			}
		}
	} finally {
		fingerprints.close();
	}

	return {
		jobs,
		missingImages: [...missingImages].toSorted((first, second) => first.localeCompare(second)),
	};
}

export async function prepareOpenGraphCardRender<Decoded>({
	cachePath,
	decode,
	distPath,
	missingImage = 'fail',
	render,
	templateVersion,
}: OpenGraphCardRenderOptions<Decoded>) {
	const resolvedCachePath = path.resolve(cachePath);
	const { openGraphCardsPath } = getImageCachePaths(resolvedCachePath);
	const manifest = await readDistManifest({ cachePath: resolvedCachePath, distPath });
	const groups = groupByImage(manifest.openGraphCards);
	const { jobs, missingImages } = await createCardJobs({
		cachePath: resolvedCachePath,
		decode,
		groups,
		mediaPath: manifest.mediaPath,
		missingImage,
		render,
		templateVersion,
	});

	function run(options: OpenGraphCardRenderRunOptions = {}) {
		return runRenderJobs({ ...options, directory: openGraphCardsPath, jobs });
	}

	return {
		directory: openGraphCardsPath,
		missingImages,
		run,
		sources: groups.filter((group) => group.image).length,
		total: jobs.length,
	};
}

export type PreparedOpenGraphCardRender = Awaited<ReturnType<typeof prepareOpenGraphCardRender>>;
