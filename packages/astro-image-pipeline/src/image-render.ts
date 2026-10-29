import type { Sharp, SharpInput, SharpOptions } from 'sharp';

import { createHash } from 'node:crypto';
import sharp from 'sharp';

import type { ResolvedImageEncoding } from './image-encoding.js';
import type { ImageFormat } from './image-formats.js';
import type { ImageDimensions } from './image-sizes.js';

import { imageFormatTraits } from './image-formats.js';

export const engineVersions = sharp.versions;

// mozjpeg output differs slightly between CPU architectures
export const engineId = createHash('sha256')
	.update(JSON.stringify({ ...engineVersions, arch: process.arch, platform: process.platform }))
	.digest('hex')
	.slice(0, 8);

// Process-wide; the job pool supplies the parallelism instead of libvips threads
export function configureEngineForJobPool() {
	sharp.concurrency(1);
	sharp.cache(false);
}

export function openImageSource(input: SharpInput, options?: Omit<SharpOptions, 'autoOrient'>) {
	return sharp(input, { ...options, autoOrient: true });
}

interface ImageRender {
	encoding: ResolvedImageEncoding;
	format: ImageFormat;
	height?: number | undefined;
	keepIccProfile: boolean;
	limitInputPixels: number;
	pages: number;
	width: number;
}

async function openRenderSource(
	filePath: string,
	{ encoding, format, limitInputPixels, pages }: ImageRender,
) {
	if (pages === 1 || !imageFormatTraits[format].canAnimate) {
		return { encoding, image: openImageSource(filePath, { limitInputPixels }) };
	}

	const image = openImageSource(filePath, { limitInputPixels, pages: -1 });
	const { format: sourceFormat } = await image.metadata();

	if (sourceFormat !== 'gif') return { encoding, image };

	return { encoding: { ...encoding, webp: { loop: 0, ...encoding.webp } }, image };
}

function encodeImage(stage: Sharp, format: ImageFormat, encoding: ResolvedImageEncoding) {
	switch (format) {
		case 'avif': {
			return stage.avif(encoding.avif);
		}
		case 'jpg': {
			return stage.jpeg(encoding.jpg);
		}
		case 'png': {
			return stage.png(encoding.png);
		}
		case 'webp': {
			return stage.webp(encoding.webp);
		}
	}
}

export async function renderImage(filePath: string, render: ImageRender) {
	const { format, height, keepIccProfile, width } = render;
	const { encoding, image } = await openRenderSource(filePath, render);
	const stage = image.resize(
		height === undefined
			? { fastShrinkOnLoad: false, width, withoutEnlargement: true }
			: { fastShrinkOnLoad: false, fit: 'cover', height, width },
	);

	// A no-op on opaque sources, so the background stays out of the render key
	if (!imageFormatTraits[format].keepsAlpha) stage.flatten({ background: '#ffffff' });

	if (keepIccProfile) stage.keepIccProfile();

	return encodeImage(stage, format, encoding).toBuffer({ resolveWithObject: true });
}

export async function readSourceInfo(filePath: string) {
	const { autoOrient, pages = 1 } = await openImageSource(filePath).metadata();

	return { height: autoOrient.height, pages, width: autoOrient.width };
}

export async function readSourceSize(filePath: string) {
	const { height, width } = await readSourceInfo(filePath);

	return { height, width } satisfies ImageDimensions;
}
