import type { ImageSize, RenditionSize } from './image-name.js';

import { formatRenditionName, getImageStem, isImageStem } from './image-name.js';
import { recordRendition } from './image-recorder.js';

export interface ImageDimensions {
	height: number;
	width: number;
}

export interface ImageSourceReference {
	id: string;
	path?: string;
}

export interface ImageSource extends ImageDimensions, ImageSourceReference {}

export function getSourcePath({ id, path = id }: ImageSourceReference) {
	return path;
}

export function isPixelCount(value: unknown) {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isWholeSize({ height = 1, width }: ImageSize) {
	return isPixelCount(width) && isPixelCount(height);
}

export function formatSize({ height, width }: ImageSize) {
	return height === undefined ? `${String(width)} wide` : `${String(width)}x${String(height)}`;
}

export function isWithinSource(size: ImageSize, source: ImageDimensions) {
	return size.width <= source.width && (size.height ?? 0) <= source.height;
}

export function fitWithinSource(size: ImageSize, source: ImageDimensions) {
	if (isWithinSource(size, source)) return size;

	if (size.height === undefined) return { width: source.width };

	const isWidthBound = source.width * size.height <= source.height * size.width;
	const width = isWidthBound
		? source.width
		: Math.max(1, Math.floor((size.width * source.height) / size.height));
	const height = Math.round((width * size.height) / size.width);

	return { height: Math.min(Math.max(1, height), source.height), width };
}

export function getRenditionName(source: ImageSource, { format, ...size }: RenditionSize) {
	if (!isWholeSize(size)) {
		throw new Error(
			`Image ${source.id} can't be named ${formatSize(size)}: sizes are whole pixels`,
		);
	}

	if (!isWithinSource(size, source)) {
		throw new Error(
			`Image ${source.id} (${String(source.width)}x${String(source.height)}) is smaller than the requested ${formatSize(size)}`,
		);
	}

	const stem = getImageStem(source.id);

	if (!isImageStem(stem)) {
		throw new Error(
			`Image ${source.id} can't be named: whitespace, quotes, &, <, >, ), commas and "." or ".." segments don't fit in an image URL; rename the file`,
		);
	}

	const name = formatRenditionName({ format, stem, ...size });

	recordRendition(name, getSourcePath(source));

	return name;
}
