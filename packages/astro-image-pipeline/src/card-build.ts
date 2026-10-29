import path from 'node:path';

import type { Card, CardImage, CardInput } from './card-name.js';
import type { ImageRenderTarget } from './image-state.js';
import type { RenderJob, RenderJobOptions } from './run-render-jobs.js';
import type { SourceFingerprints } from './source-fingerprints.js';

import { configureEngineForJobPool, engineId } from './image-render.js';
import { getStoreLayout, readDistManifest } from './image-state.js';
import { hashRenderKey } from './render-key.js';
import { runRenderJobs } from './run-render-jobs.js';
import { createSourceFingerprints } from './source-fingerprints.js';

export interface CardSource extends CardImage {
	filePath: string;
}

export type CardRenderRunOptions = Pick<
	RenderJobOptions,
	'concurrency' | 'onFailure' | 'onProgress' | 'onReplace' | 'signal'
>;

type MissingImagePolicy = 'fail' | 'omit';

export interface CardRenderOptions<Decoded> extends ImageRenderTarget {
	decode: (source: CardSource) => Promise<Decoded>;
	missingImage?: MissingImagePolicy;
	render: (input: CardInput, decoded?: Decoded) => Promise<Uint8Array>;
	templateVersion: string;
}

interface CardGroup {
	cards: Array<[name: string, input: CardInput]>;
	image?: CardImage;
}

interface CardSourceState {
	digest?: string;
	source: CardSource;
}

export function getCardKey({
	digest = '',
	engine,
	image,
	input,
	templateVersion,
}: {
	digest?: string | undefined;
	engine: string;
	image?: CardImage | undefined;
	input: CardInput;
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

function groupByImage(cards: Record<string, Card>) {
	const groups = new Map<string, CardGroup>();

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
	image: CardImage,
): Promise<CardSourceState> {
	const source = { ...image, filePath: path.resolve(mediaPath, image.path) };
	const fingerprint = await fingerprints.get(source.filePath);

	return fingerprint ? { digest: fingerprint.sha256, source } : { source };
}

function createGroupDecoder<Decoded>({
	decode,
	missingImage,
}: Pick<CardRenderOptions<Decoded>, 'decode'> & { missingImage: MissingImagePolicy }) {
	let current: undefined | { decoded: Promise<Decoded | undefined>; state: CardSourceState };

	function startDecode(state: CardSourceState) {
		if (state.digest) return decode(state.source);

		if (missingImage === 'omit') return Promise.resolve(undefined);

		return Promise.reject(new Error(`Missing image: ${state.source.path}`));
	}

	return function getDecoded(state: CardSourceState) {
		if (current?.state !== state) current = { decoded: startDecode(state), state };

		return current.decoded;
	};
}

async function createCardJobs<Decoded>({
	decode,
	groups,
	mediaPath,
	missingImage,
	render,
	storePath,
	templateVersion,
}: Pick<CardRenderOptions<Decoded>, 'decode' | 'render' | 'templateVersion'> & {
	groups: ReadonlyArray<CardGroup>;
	mediaPath: string;
	missingImage: MissingImagePolicy;
	storePath: string;
}) {
	const fingerprints = createSourceFingerprints(storePath);
	const getDecoded = createGroupDecoder({ decode, missingImage });
	const jobs: Array<RenderJob> = [];
	const missingImages = new Map<string, Array<string>>();

	try {
		for (const { cards, image } of groups) {
			const state = image ? await readSourceState(fingerprints, mediaPath, image) : undefined;

			if (state && !state.digest) {
				const missingCards = missingImages.get(state.source.path) ?? [];

				missingCards.push(...cards.map(([name]) => name));
				missingImages.set(state.source.path, missingCards);
			}

			for (const [name, input] of cards) {
				jobs.push({
					key: getCardKey({
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
		missingImages: [...missingImages]
			.toSorted(([first], [second]) => first.localeCompare(second))
			.map(([imagePath, cards]) => ({
				cards: cards.toSorted((first, second) => first.localeCompare(second)),
				path: imagePath,
			})),
	};
}

export async function prepareCardRender<Decoded>({
	decode,
	distPath,
	missingImage = 'fail',
	render,
	storePath,
	templateVersion,
}: CardRenderOptions<Decoded>) {
	const resolvedStorePath = path.resolve(storePath);
	const { cardsPath } = getStoreLayout(resolvedStorePath);
	const manifest = await readDistManifest({ distPath, storePath: resolvedStorePath });
	const groups = groupByImage(manifest.cards);
	const { jobs, missingImages } = await createCardJobs({
		decode,
		groups,
		mediaPath: manifest.mediaPath,
		missingImage,
		render,
		storePath: resolvedStorePath,
		templateVersion,
	});

	function run(options: CardRenderRunOptions = {}) {
		configureEngineForJobPool();

		return runRenderJobs({ ...options, directory: cardsPath, jobs });
	}

	return {
		cards: jobs.map(({ name }) => name).toSorted((first, second) => first.localeCompare(second)),
		directory: cardsPath,
		missingImages,
		run,
		sources: groups.filter((group) => group.image).length,
		total: jobs.length,
	};
}

export type PreparedCardRender = Awaited<ReturnType<typeof prepareCardRender>>;
