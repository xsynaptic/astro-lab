import type { ImageEncoding } from './image-encoding.js';
import type { ImageSize, RenditionSize } from './image-name.js';

import { resolveImageEncoding } from './image-encoding.js';
import { formatImageName, getImageStem, isImageStem } from './image-name.js';
import { recordRendition } from './image-recorder.js';

export interface ImageDimensions {
	height: number;
	width: number;
}

export interface ImageSource extends ImageDimensions {
	id: string;
	path?: string;
}

function isWholeSize({ height, width }: ImageSize) {
	return [width, height ?? 1].every((value) => Number.isSafeInteger(value) && value > 0);
}

function formatSize({ height, width }: ImageSize) {
	return height === undefined ? `${String(width)} wide` : `${String(width)}x${String(height)}`;
}

export function isWithinSource(size: ImageSize, source: ImageDimensions) {
	return size.width <= source.width && (size.height ?? 0) <= source.height;
}

export function getSizedName(source: ImageSource, { format, ...size }: RenditionSize) {
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

	const name = formatImageName({ format, stem, ...size });

	recordRendition(name, source.path ?? source.id);

	return name;
}

export function defineImagePipeline({ encoding }: { encoding?: ImageEncoding }) {
	return { encoding: resolveImageEncoding(encoding), getSizedName };
}
