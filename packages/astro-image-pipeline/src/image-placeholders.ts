import type { Sharp } from 'sharp';

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';

import type { ImageSize } from './image-name.js';
import type { ImageDimensions, ImageSource } from './image-sizes.js';
import type { SourceFingerprints } from './source-fingerprints.js';

import { openImageSource } from './image-render.js';
import { formatSize, getSourcePath, isPixelCount, isWholeSize } from './image-sizes.js';
import { getStoreLayout } from './image-state.js';
import { hashRenderKey } from './render-key.js';
import { createSourceFingerprints } from './source-fingerprints.js';
import { UserError } from './user-error.js';

export const imagePlaceholdersVariable = 'XSYNAPTIC_IMAGE_PLACEHOLDERS';

const placeholderRevision = 1;

export interface ImagePlaceholderOptions {
	blur?: number;
	pixels: number;
	quality: number;
	saturation?: number;
}

type PlaceholderLook = Omit<ImagePlaceholderOptions, 'pixels'>;

export interface PlaceholderConfig extends ImagePlaceholderOptions {
	limitInputPixels: number;
	mediaPath: string;
	storePath: string;
}

export interface ImagePlaceholderRequest {
	pixels?: number;
	size?: ImageSize;
}

interface PlaceholderStore {
	close(): void;
	config: PlaceholderConfig;
	fingerprints: SourceFingerprints;
	inFlight: Map<string, Promise<string | undefined>>;
	// `null` caches a source that has no placeholder
	read(key: string): null | string | undefined;
	variable: string;
	write(key: string, dataUrl: string | undefined): void;
}

let store: PlaceholderStore | undefined;

function isInRange(value: number, minimum: number, maximum = Infinity) {
	return value >= minimum && value <= maximum;
}

export function validatePlaceholderOptions({
	blur,
	pixels,
	quality,
	saturation,
}: ImagePlaceholderOptions) {
	if (!isPixelCount(pixels)) {
		throw new Error(
			`imagePipeline placeholders take a whole, positive pixel count, not ${String(pixels)}`,
		);
	}

	if (!Number.isSafeInteger(quality) || !isInRange(quality, 1, 100)) {
		throw new Error(
			`imagePipeline placeholders take a whole quality from 1 to 100, not ${String(quality)}`,
		);
	}

	if (blur !== undefined && (!Number.isFinite(blur) || !isInRange(blur, 0.3, 1000))) {
		throw new Error(
			`imagePipeline placeholders take a blur sigma from 0.3 to 1000, not ${String(blur)}`,
		);
	}

	if (saturation !== undefined && (!Number.isFinite(saturation) || !isInRange(saturation, 0))) {
		throw new Error(
			`imagePipeline placeholders take a saturation of 0 or more, not ${String(saturation)}`,
		);
	}
}

function getPlaceholderGrid(aspectRatio: number, pixels: number): ImageDimensions {
	const height = Math.sqrt(pixels / aspectRatio);

	return {
		height: Math.max(1, Math.round(height)),
		width: Math.max(1, Math.round(pixels / height)),
	};
}

export function getPlaceholderKey({
	blur,
	digest,
	grid,
	quality,
	saturation = 1,
}: PlaceholderLook & { digest: string; grid: ImageDimensions }) {
	return hashRenderKey([
		digest,
		grid.width,
		grid.height,
		quality,
		blur ?? '',
		saturation,
		placeholderRevision,
	]);
}

function openPlaceholderStore(variable: string): PlaceholderStore {
	const config = JSON.parse(variable) as PlaceholderConfig;

	mkdirSync(config.storePath, { recursive: true });

	const database = new DatabaseSync(getStoreLayout(config.storePath).placeholdersPath);

	database.exec(
		'PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL',
	);
	database.exec('CREATE TABLE IF NOT EXISTS placeholders (key TEXT PRIMARY KEY, data_url TEXT)');

	const selectStatement = database.prepare('SELECT data_url FROM placeholders WHERE key = ?');
	const upsertStatement = database.prepare(
		'INSERT INTO placeholders (key, data_url) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data_url = excluded.data_url',
	);

	const fingerprints = createSourceFingerprints(config.storePath);

	return {
		close() {
			database.close();
			fingerprints.close();
		},
		config,
		fingerprints,
		inFlight: new Map(),
		read(key) {
			const row = selectStatement.get(key) as undefined | { data_url: null | string };

			return row?.data_url;
		},
		variable,
		write(key, dataUrl) {
			// eslint-disable-next-line unicorn/no-null -- node:sqlite binds NULL only from null
			upsertStatement.run(key, dataUrl ?? null);
		},
	};
}

// Requests already running on a replaced store still write to it
function closeWhenSettled(placeholderStore: PlaceholderStore) {
	void Promise.allSettled(placeholderStore.inFlight.values()).then(() => {
		placeholderStore.close();
	});
}

function getPlaceholderStore() {
	const variable = process.env[imagePlaceholdersVariable];

	if (store && store.variable !== variable) {
		closeWhenSettled(store);
		store = undefined;
	}

	if (!variable) {
		throw new UserError(
			'getPlaceholder needs the @xsynaptic/astro-image-pipeline integration with its placeholders option, in the Astro process that renders the page',
		);
	}

	if (!store) store = openPlaceholderStore(variable);

	return store;
}

function encodePlaceholder(image: Sharp, { blur, quality, saturation = 1 }: PlaceholderLook) {
	const blurred = blur === undefined ? image : image.blur(blur);

	return blurred.modulate({ saturation }).webp({ quality });
}

async function renderPlaceholder(
	filePath: string,
	{
		grid,
		limitInputPixels,
		look,
	}: { grid: ImageDimensions; limitInputPixels: number; look: PlaceholderLook },
) {
	const { data, info } = await openImageSource(filePath, { failOn: 'error', limitInputPixels })
		.resize(grid.width, grid.height, { fit: 'cover' })
		.raw()
		.toBuffer({ resolveWithObject: true });
	const raw = { raw: { channels: info.channels, height: info.height, width: info.width } };
	const { isOpaque } = await sharp(data, raw).stats();

	if (!isOpaque) return;

	const encoded = await encodePlaceholder(sharp(data, raw), look).toBuffer();

	return `data:image/webp;base64,${encoded.toString('base64')}`;
}

async function resolvePlaceholder(
	placeholderStore: PlaceholderStore,
	filePath: string,
	grid: ImageDimensions,
) {
	const { config } = placeholderStore;
	const fingerprint = await placeholderStore.fingerprints.get(filePath);

	if (!fingerprint)
		throw new Error(`Image source ${filePath} is missing, so it has no placeholder`);

	const key = getPlaceholderKey({ ...config, digest: fingerprint.sha256, grid });
	const cached = placeholderStore.read(key);

	if (cached !== undefined) return cached ?? undefined;

	const dataUrl = await renderPlaceholder(filePath, {
		grid,
		limitInputPixels: config.limitInputPixels,
		look: config,
	});

	placeholderStore.write(key, dataUrl);

	return dataUrl;
}

async function resolveOnce(
	placeholderStore: PlaceholderStore,
	filePath: string,
	grid: ImageDimensions,
	requestKey: string,
) {
	try {
		return await resolvePlaceholder(placeholderStore, filePath, grid);
	} finally {
		placeholderStore.inFlight.delete(requestKey);
	}
}

export async function getPlaceholder(
	source: ImageSource,
	{ pixels, size }: ImagePlaceholderRequest = {},
) {
	if (size && !isWholeSize(size)) {
		throw new Error(
			`Image ${source.id} can't have a ${formatSize(size)} placeholder: sizes are whole pixels`,
		);
	}

	if (pixels !== undefined && !isPixelCount(pixels)) {
		throw new Error(
			`Image ${source.id} placeholders take a whole, positive pixel count, not ${String(pixels)}`,
		);
	}

	const placeholderStore = getPlaceholderStore();
	const { config, inFlight } = placeholderStore;
	const aspectRatio =
		size?.height === undefined ? source.width / source.height : size.width / size.height;
	const grid = getPlaceholderGrid(aspectRatio, pixels ?? config.pixels);
	const filePath = path.resolve(config.mediaPath, getSourcePath(source));
	const requestKey = `${filePath}:${String(grid.width)}x${String(grid.height)}`;
	const pending = inFlight.get(requestKey);

	if (pending) return pending;

	const request = resolveOnce(placeholderStore, filePath, grid, requestKey);

	inFlight.set(requestKey, request);

	return request;
}
