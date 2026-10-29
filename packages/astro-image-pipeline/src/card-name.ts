import type { ImageFormat } from './image-name.js';
import type { ImageSourceReference } from './image-sizes.js';

import { isImageStem } from './image-name.js';
import { recordCard } from './image-recorder.js';
import { getSourcePath } from './image-sizes.js';

export type CardValue = Array<CardValue> | boolean | CardObject | number | string;

interface CardObject {
	[key: string]: CardValue | undefined;
}

export type CardInput = CardObject;

export interface CardImage {
	path: string;
	treatment?: string;
}

export interface CardImageInput extends ImageSourceReference {
	treatment?: string;
}

export interface Card {
	image?: CardImage;
	input: CardInput;
}

export interface CardRequest {
	id: string;
	image?: CardImageInput;
	input: CardInput;
}

function canonicalizeValue(value: CardValue): CardValue {
	if (Array.isArray(value)) return value.map((item) => canonicalizeValue(item));

	if (typeof value === 'object') return canonicalizeObject(value);

	if (typeof value === 'number' && !Number.isFinite(value)) {
		throw new TypeError(`Card input can't hold ${String(value)}; JSON has no such number`);
	}

	return value;
}

function compareCodeUnits(first: string, second: string) {
	if (first < second) return -1;

	if (first > second) return 1;

	return 0;
}

function canonicalizeObject(value: CardObject) {
	const sorted: CardObject = {};

	for (const key of Object.keys(value).toSorted(compareCodeUnits)) {
		const entry = value[key];

		if (entry !== undefined) sorted[key] = canonicalizeValue(entry);
	}

	return sorted;
}

export function canonicalizeCard({ image, input }: Omit<CardRequest, 'id'>): Card {
	const canonicalInput = canonicalizeObject(input);

	if (!image) return { input: canonicalInput };

	const path = getSourcePath(image);
	const canonicalImage: CardImage =
		image.treatment === undefined ? { path } : { path, treatment: image.treatment };

	return { image: canonicalImage, input: canonicalInput };
}

export function getCardName({ id, ...card }: CardRequest, { format }: { format: ImageFormat }) {
	if (!isImageStem(id)) {
		throw new Error(
			`Card ${id} can't be named: whitespace, quotes, &, <, >, ), commas and "." or ".." segments don't fit in a URL`,
		);
	}

	const name = `${id}.${format}`;

	recordCard(name, canonicalizeCard(card));

	return name;
}
