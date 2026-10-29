import type { AstroIntegration, AstroIntegrationLogger } from 'astro';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Card } from './card-name.js';
import type { ImageEncoding } from './image-encoding.js';
import type { ImagePlaceholderOptions, PlaceholderConfig } from './image-placeholders.js';
import type { ImageSourceResolver } from './image-sources.js';
import type { ImageManifest } from './image-state.js';

import { createDevImageResolver } from './dev-resolver.js';
import { resolveImageEncoding } from './image-encoding.js';
import { imageFormatTraits, isImageFormat } from './image-formats.js';
import { imagePlaceholdersVariable, validatePlaceholderOptions } from './image-placeholders.js';
import { imageRecordsVariable } from './image-recorder.js';
import { readImageRecords, resetImageRecords } from './image-records.js';
import { createDirectorySources } from './image-sources.js';
import {
	getStoreLayout,
	imageManifestVersion,
	readLatestManifest,
	writeBuildId,
	writeImageManifest,
} from './image-state.js';
import { UserError } from './user-error.js';

export type { ImageEncoding } from './image-encoding.js';
export type { ImagePlaceholderOptions } from './image-placeholders.js';
export type { ImageSourceResolver } from './image-sources.js';
export { createDirectorySources } from './image-sources.js';

export interface ImagePipelineOptions {
	baseUrl?: string;
	encoding?: ImageEncoding;
	keepIccProfile?: boolean;
	limitInputPixels?: number;
	mediaPath: string;
	placeholders?: ImagePlaceholderOptions;
	sources?: ImageSourceResolver;
	storePath: string;
}

const sharpDefaultInputPixelLimit = 0x3f_ff * 0x3f_ff;

function decodeImageName(pathname: string) {
	try {
		return decodeURIComponent(pathname).replace(/^\/+/, '');
	} catch {
		return;
	}
}

function getContentType(filePath: string) {
	const format = path.extname(filePath).slice(1);

	if (!isImageFormat(format)) throw new Error(`${filePath} has no image format extension`);

	return imageFormatTraits[format].contentType;
}

async function readPreviousManifest(storePath: string) {
	try {
		return await readLatestManifest(storePath);
	} catch (error) {
		if (error instanceof UserError) return;

		throw error;
	}
}

async function readRecorded({
	isIncremental,
	logger,
	pageCount,
	recordsPath,
	storePath,
}: {
	isIncremental: boolean;
	logger: AstroIntegrationLogger;
	pageCount: number;
	recordsPath: string;
	storePath: string;
}) {
	const recorded = await readImageRecords(recordsPath);

	// Pages an incremental build skips still count in `pages`, but record nothing
	if (isIncremental) {
		logger.warn(
			"Incremental build: pages restored from cache record nothing, so the manifest keeps the previous build's names too; names only fall out on a full build",
		);

		const previous = await readPreviousManifest(storePath);

		return {
			cards: new Map([...Object.entries(previous?.cards ?? {}), ...recorded.cards]),
			renditions: new Map([...Object.entries(previous?.renditions ?? {}), ...recorded.renditions]),
		};
	}

	if (recorded.renditions.size === 0 && recorded.cards.size === 0 && pageCount > 0) {
		throw new Error(
			`No image names were recorded while building ${String(pageCount)} pages; build image URLs with getRenditionName at render time, in a runtime that has node:fs`,
		);
	}

	return recorded;
}

async function writeBuildManifest({
	distPath,
	logger,
	manifest,
	recorded: { cards, renditions },
	storePath,
}: {
	distPath: string;
	logger: AstroIntegrationLogger;
	manifest: Pick<ImageManifest, 'encoding' | 'keepIccProfile' | 'limitInputPixels' | 'mediaPath'>;
	recorded: {
		cards: ReadonlyMap<string, Card>;
		renditions: ReadonlyMap<string, string>;
	};
	storePath: string;
}) {
	const buildId = randomUUID();

	await writeImageManifest(storePath, {
		...manifest,
		buildId,
		cards: Object.fromEntries(cards),
		renditions: Object.fromEntries(renditions),
		version: imageManifestVersion,
	});
	await writeBuildId(distPath, buildId);

	logger.info(
		`${String(renditions.size)} renditions from ${String(new Set(renditions.values()).size)} sources, ${String(cards.size)} cards`,
	);
}

function createDevImageHandler(
	getDevImage: ReturnType<typeof createDevImageResolver>,
	logger: AstroIntegrationLogger,
) {
	return async function serveDevImage(request: IncomingMessage, response: ServerResponse) {
		const { pathname } = new URL(request.url ?? '/', 'http://localhost');
		const name = decodeImageName(pathname);

		if (name === undefined) {
			response.statusCode = 400;
			response.end();
			return;
		}

		try {
			const filePath = await getDevImage(name);

			if (!filePath) {
				response.statusCode = 404;
				response.end();
				return;
			}

			response.setHeader('Cache-Control', 'no-cache');
			response.setHeader('Content-Type', getContentType(filePath));
			response.end(await fs.readFile(filePath));
		} catch (error) {
			logger.error(`${pathname}: ${error instanceof Error ? error.message : String(error)}`);
			response.statusCode = 500;
			response.end();
		}
	};
}

async function isBuiltFrom(storePath: string, mediaPath: string) {
	try {
		const manifest = await readLatestManifest(storePath);

		return manifest?.mediaPath === mediaPath;
	} catch {
		return false;
	}
}

export default function imagePipeline({
	baseUrl,
	encoding,
	keepIccProfile = false,
	limitInputPixels = sharpDefaultInputPixelLimit,
	mediaPath,
	placeholders,
	sources,
	storePath,
}: ImagePipelineOptions): AstroIntegration {
	if (baseUrl?.replace(/\/+$/, '') === '') {
		throw new Error(
			'imagePipeline needs a baseUrl below the site root; at the root, every request and every root-relative URL would count as an image',
		);
	}

	if (placeholders) validatePlaceholderOptions(placeholders);

	const absoluteMediaPath = path.resolve(mediaPath);
	const resolvedEncoding = resolveImageEncoding(encoding);
	const absoluteStorePath = path.resolve(storePath);
	const placeholderVariable =
		placeholders &&
		JSON.stringify({
			...placeholders,
			limitInputPixels,
			mediaPath: absoluteMediaPath,
			storePath: absoluteStorePath,
		} satisfies PlaceholderConfig);
	const { devPath, recordsPath, renditionsPath } = getStoreLayout(absoluteStorePath);
	let isIncremental = false;
	let buildRecordsPath = recordsPath;

	return {
		hooks: {
			'astro:build:done': async ({ dir, logger, pages }) => {
				try {
					const distPath = fileURLToPath(dir);
					const recorded = await readRecorded({
						isIncremental,
						logger,
						pageCount: pages.length,
						recordsPath: buildRecordsPath,
						storePath: absoluteStorePath,
					});

					await writeBuildManifest({
						distPath,
						logger,
						manifest: {
							encoding: resolvedEncoding,
							keepIccProfile,
							limitInputPixels,
							mediaPath: absoluteMediaPath,
						},
						recorded,
						storePath: absoluteStorePath,
					});
					await fs.rm(recordsPath, { force: true, recursive: true });
				} finally {
					Reflect.deleteProperty(process.env, imageRecordsVariable);
				}
			},
			'astro:config:setup': async ({ command, config }) => {
				// Dev restarts reuse the process; a removed option must clear the old config
				Reflect.deleteProperty(process.env, imagePlaceholdersVariable);

				if (placeholderVariable) process.env[imagePlaceholdersVariable] = placeholderVariable;

				if (command !== 'build') return;

				isIncremental = config.experimental.incrementalBuild;
				buildRecordsPath = await resetImageRecords(recordsPath);
				process.env[imageRecordsVariable] = buildRecordsPath;
			},
			'astro:server:setup': async ({ logger, server }) => {
				// An absolute base URL means dev fetches images from the live host
				if (!baseUrl?.startsWith('/')) return;

				const mediaPathKey = createHash('sha256')
					.update(absoluteMediaPath)
					.digest('hex')
					.slice(0, 8);
				const getDevImage = createDevImageResolver({
					builtPath: (await isBuiltFrom(absoluteStorePath, absoluteMediaPath))
						? renditionsPath
						: undefined,
					devPath: path.resolve(devPath, mediaPathKey),
					encoding: resolvedEncoding,
					keepIccProfile,
					limitInputPixels,
					mediaPath: absoluteMediaPath,
					sources: sources ?? createDirectorySources(absoluteMediaPath),
				});

				const serveDevImage = createDevImageHandler(getDevImage, logger);

				server.middlewares.use(baseUrl.replace(/\/+$/, ''), (request, response) => {
					void serveDevImage(request, response);
				});
			},
		},
		name: '@xsynaptic/astro-image-pipeline',
	};
}
