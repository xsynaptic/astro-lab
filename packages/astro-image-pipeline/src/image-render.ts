import type { SharpInput, SharpOptions } from 'sharp';

import { createHash } from 'node:crypto';
import sharp from 'sharp';

import type { ResolvedImageEncoding } from './image-encoding.js';
import type { ImageFormat } from './image-name.js';
import type { ImageDimensions } from './image-presets.js';

export const engineVersions = sharp.versions;

// mozjpeg output differs slightly between CPU architectures
export const engineId = createHash('sha256')
	.update(JSON.stringify({ ...engineVersions, arch: process.arch, platform: process.platform }))
	.digest('hex')
	.slice(0, 8);

export function openImageSource(input: SharpInput, options?: Omit<SharpOptions, 'autoOrient'>) {
	return sharp(input, { ...options, autoOrient: true });
}

interface ImageRender {
	encoding: ResolvedImageEncoding;
	format: ImageFormat;
	height?: number | undefined;
	limitInputPixels: number;
	width: number;
}

export async function renderImage(
	source: string,
	{ encoding, format, height, limitInputPixels, width }: ImageRender,
) {
	const stage = openImageSource(source, { limitInputPixels }).resize(
		height === undefined
			? { fastShrinkOnLoad: false, width, withoutEnlargement: true }
			: { fastShrinkOnLoad: false, fit: 'cover', height, width },
	);

	// A no-op on opaque sources, so the background stays out of the cache key
	if (format === 'jpg') {
		return stage
			.flatten({ background: '#ffffff' })
			.jpeg(encoding.jpg)
			.toBuffer({ resolveWithObject: true });
	}

	return stage.webp(encoding.webp).toBuffer({ resolveWithObject: true });
}

export async function readSourceSize(sourcePath: string) {
	const { autoOrient } = await openImageSource(sourcePath).metadata();

	return { height: autoOrient.height, width: autoOrient.width } satisfies ImageDimensions;
}
