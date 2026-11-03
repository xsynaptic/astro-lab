import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import type { RenditionName } from '../src/image-name.js';

import { imageFormats } from '../src/image-formats.js';
import {
	findStemCollisions,
	formatRenditionName,
	getImageStem,
	isImageStem,
	parseRenditionName,
} from '../src/image-name.js';

const stemSegment = fc.string({
	maxLength: 6,
	minLength: 1,
	unit: fc.constantFrom('a', 'B', '0', '1', '2', '-', 'x', '.', '_'),
});

const safeStem = fc
	.array(stemSegment, { maxLength: 3, minLength: 1 })
	.map((segments) => segments.join('/'))
	.filter((stem) => isImageStem(stem));

const pixelCount = fc.integer({ max: 99_999, min: 1 });

const renditionName = fc
	.record({
		format: fc.constantFrom(...imageFormats),
		height: fc.option(pixelCount, { nil: undefined }),
		stem: safeStem,
		width: pixelCount,
	})
	.map(({ height, ...name }): RenditionName => (height === undefined ? name : { ...name, height }));

const nameLike = fc
	.tuple(
		stemSegment,
		fc.string({ maxLength: 4, minLength: 1, unit: fc.constantFrom('0', '1', '9') }),
		fc.option(fc.string({ maxLength: 3, unit: fc.constantFrom('x', '0', '1', '-') }), { nil: '' }),
		fc.constantFrom(...imageFormats, 'jpeg', 'gif'),
	)
	.map(([stem, width, height, format]) => `${stem}-${width}${height}.${format}`);

describe('parseRenditionName', () => {
	test.each([
		{ format: 'jpg', stem: 'taiwan/taipei/some-image-1', width: 1200 },
		{ format: 'webp', height: 800, stem: 'taiwan/taipei/some-image-1', width: 1200 },
		{ format: 'png', stem: 'diagrams/flow', width: 600 },
		{ format: 'avif', height: 400, stem: 'diagrams/flow', width: 600 },
	] as const)('round-trips $stem at $width', (name) => {
		expect(parseRenditionName(formatRenditionName(name))).toStrictEqual(name);
	});

	test('a stem ending in digits keeps them, since only the last segment is the size', () => {
		expect(parseRenditionName('a/b-1-450.jpg')).toStrictEqual({
			format: 'jpg',
			stem: 'a/b-1',
			width: 450,
		});
	});

	test.prop([renditionName])('reads back every name it formats', (name) => {
		expect(parseRenditionName(formatRenditionName(name))).toStrictEqual(name);
	});

	test.prop([nameLike])('formats every name it reads back to the same string', (name) => {
		const parsed = parseRenditionName(name);

		fc.pre(parsed !== undefined);

		expect(formatRenditionName(parsed)).toBe(name);
	});

	test.each([
		['a missing size', 'a/b.jpg'],
		['a zero width', 'a/b-0.jpg'],
		['a zero height', 'a/b-450x0.webp'],
		['an unknown format', 'a/b-450.gif'],
		['a second spelling of a format', 'a/b-450.jpeg'],
		['a `..` segment', '../media/a/b-450.jpg'],
		['an empty segment', '/a/b-450.jpg'],
	])('rejects %s', (_label, name) => {
		expect(parseRenditionName(name)).toBeUndefined();
	});
});

describe('getImageStem', () => {
	test('drops only the extension of the last segment', () => {
		expect(getImageStem('2007/vancouver.2007/x-1.jpg')).toBe('2007/vancouver.2007/x-1');
	});
});

describe('findStemCollisions', () => {
	test('groups sources whose stems match ignoring case and extension', () => {
		expect(findStemCollisions(['a/b.jpg', 'a/c.jpg', 'a/B.png', 'd/b.jpg'])).toStrictEqual([
			['a/b.jpg', 'a/B.png'],
		]);
	});
});
