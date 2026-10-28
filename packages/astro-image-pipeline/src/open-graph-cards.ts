import type { ImageFormat } from './image-name.js';
import type { ImageSourceReference } from './image-sizes.js';

import { isImageStem } from './image-name.js';
import { recordOpenGraphCard } from './image-recorder.js';
import { getSourcePath } from './image-sizes.js';

export type OpenGraphCardValue =
	Array<OpenGraphCardValue> | boolean | number | OpenGraphCardObject | string;

interface OpenGraphCardObject {
	[key: string]: OpenGraphCardValue | undefined;
}

export type OpenGraphCardInput = OpenGraphCardObject;

export interface OpenGraphCardImage {
	path: string;
	treatment?: string;
}

export interface OpenGraphCardImageInput extends ImageSourceReference {
	treatment?: string;
}

export interface OpenGraphCard {
	image?: OpenGraphCardImage;
	input: OpenGraphCardInput;
}

export interface OpenGraphCardRequest {
	id: string;
	image?: OpenGraphCardImageInput;
	input: OpenGraphCardInput;
}

function canonicalizeValue(value: OpenGraphCardValue): OpenGraphCardValue {
	if (Array.isArray(value)) return value.map((item) => canonicalizeValue(item));

	if (typeof value === 'object') return canonicalizeObject(value);

	if (typeof value === 'number' && !Number.isFinite(value)) {
		throw new TypeError(
			`OpenGraph card input can't hold ${String(value)}; JSON has no such number`,
		);
	}

	return value;
}

function compareCodeUnits(first: string, second: string) {
	if (first < second) return -1;

	if (first > second) return 1;

	return 0;
}

function canonicalizeObject(value: OpenGraphCardObject) {
	const sorted: OpenGraphCardObject = {};

	for (const key of Object.keys(value).toSorted(compareCodeUnits)) {
		const entry = value[key];

		if (entry !== undefined) sorted[key] = canonicalizeValue(entry);
	}

	return sorted;
}

export function canonicalizeOpenGraphCard({
	image,
	input,
}: Omit<OpenGraphCardRequest, 'id'>): OpenGraphCard {
	const canonicalInput = canonicalizeObject(input);

	if (!image) return { input: canonicalInput };

	const path = getSourcePath(image);
	const canonicalImage: OpenGraphCardImage =
		image.treatment === undefined ? { path } : { path, treatment: image.treatment };

	return { image: canonicalImage, input: canonicalInput };
}

export function getCardName(
	{ id, ...card }: OpenGraphCardRequest,
	{ format }: { format: ImageFormat },
) {
	if (!isImageStem(id)) {
		throw new Error(
			`OpenGraph card ${id} can't be named: whitespace, quotes, &, <, >, ), commas and "." or ".." segments don't fit in a URL`,
		);
	}

	const name = `${id}.${format}`;

	recordOpenGraphCard(name, canonicalizeOpenGraphCard(card));

	return name;
}
