import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import type { ImageSize } from '../src/image-name.js';

import {
	fitWithinSource,
	getRenditionName,
	isWholeSize,
	isWithinSource,
} from '../src/image-sizes.js';

const sourceDimensions = fc.record({
	height: fc.integer({ max: 60, min: 1 }),
	width: fc.integer({ max: 60, min: 1 }),
});

// Float division can land just past an exact half: 55 × (3 / 22) gives 7.4999…
const halfPixel = 0.5 + 1e-9;

const requestedSize = fc
	.record({
		height: fc.option(fc.integer({ max: 150, min: 1 }), { nil: undefined }),
		width: fc.integer({ max: 150, min: 1 }),
	})
	.map(({ height, width }): ImageSize => (height === undefined ? { width } : { height, width }));

function makeSource(width: number, height: number, id = 'taiwan/taipei/some-image-1.jpg') {
	return { height, id, width };
}

describe('getRenditionName', () => {
	const landscape = makeSource(4032, 3024);

	test.each([['1080x810', landscape, 1080, 810]])(
		'names an exact cover size: %s',
		(size, source, width, height) => {
			expect(getRenditionName(source, { format: 'webp', height, width })).toBe(
				`taiwan/taipei/some-image-1-${size}.webp`,
			);
		},
	);

	test.each([[800, 500]])('a band clamped to a small source fits it: %i x %i', (width, height) => {
		expect(getRenditionName(makeSource(800, 500), { format: 'jpg', height, width })).toBe(
			`taiwan/taipei/some-image-1-${String(width)}x${String(height)}.jpg`,
		);
	});

	test('a full-size download is width-only at the source width', () => {
		expect(getRenditionName(landscape, { format: 'jpg', width: 4032 })).toBe(
			'taiwan/taipei/some-image-1-4032.jpg',
		);
	});

	test.each([{ width: 4033 }, { height: 501, width: 800 }])(
		'a size over the source throws rather than upscaling: %o',
		(size) => {
			expect(() => getRenditionName(makeSource(800, 500), { format: 'jpg', ...size })).toThrow(
				'smaller than the requested',
			);
		},
	);

	test.each([
		{ width: 0 },
		{ width: 1.5 },
		{ height: 0, width: 400 },
		{ height: 266.7, width: 800 },
	])('a size that is not whole pixels throws: %o', (size) => {
		expect(() => getRenditionName(landscape, { format: 'jpg', ...size })).toThrow('whole pixels');
	});

	test.each(['trip/IMG 0001.jpg', 'trip/day, 2.jpg', "trip/it's.png", 'trip/../b.jpg'])(
		'a source path the name grammar would reject throws: %s',
		(id) => {
			expect(() =>
				getRenditionName(makeSource(3600, 2400, id), { format: 'jpg', width: 1200 }),
			).toThrow('rename the file');
		},
	);
});

describe('fitWithinSource', () => {
	test.each([
		[
			'a size within the source is unchanged',
			{ height: 400, width: 600 },
			{ height: 400, width: 600 },
		],
		['a width-only size shrinks to the source width', { width: 1200 }, { width: 800 }],
		[
			'a crop wider than the source keeps its ratio at full width',
			{ height: 200, width: 1200 },
			{ height: 133, width: 800 },
		],
		[
			'a crop taller than the source keeps its ratio at full height',
			{ height: 800, width: 1200 },
			{ height: 500, width: 750 },
		],
	])('%s', (_label, size, expected) => {
		expect(fitWithinSource(size, makeSource(800, 500))).toStrictEqual(expected);
	});

	test('every fitted size can be named', () => {
		const sources = [
			makeSource(800, 500),
			makeSource(333, 1000),
			makeSource(4032, 3024),
			makeSource(7, 3),
		];
		const sizes = [
			{ width: 5000 },
			{ height: 800, width: 1200 },
			{ height: 100, width: 3600 },
			{ height: 3000, width: 450 },
		];

		for (const source of sources) {
			for (const size of sizes) {
				expect(() =>
					getRenditionName(source, { format: 'jpg', ...fitWithinSource(size, source) }),
				).not.toThrow();
			}
		}
	});

	test.prop([requestedSize, sourceDimensions])(
		'fits whole pixels within the source, and leaves a size that already fits alone',
		(size, source) => {
			const fitted = fitWithinSource(size, source);

			expect(isWholeSize(fitted)).toBe(true);
			expect(isWithinSource(fitted, source)).toBe(true);
			expect(fitWithinSource(fitted, source)).toStrictEqual(fitted);
			if (isWithinSource(size, source)) expect(fitted).toStrictEqual(size);
		},
	);

	test.prop([requestedSize, sourceDimensions])(
		'shrinks a size too large for its source only until one edge meets the source',
		(size, source) => {
			fc.pre(!isWithinSource(size, source));

			const fitted = fitWithinSource(size, source);

			expect(fitted.width === source.width || fitted.height === source.height).toBe(true);
		},
	);

	test.prop([requestedSize, sourceDimensions], {
		examples: [
			[
				{ height: 22, width: 55 },
				{ height: 3, width: 8 },
			],
		],
	})(
		'keeps each side within half a pixel of the requested size scaled to fit the source',
		(size, source) => {
			fc.pre(!isWithinSource(size, source) && size.height !== undefined);

			const requestedHeight = size.height ?? 0;
			const scale = Math.min(source.width / size.width, source.height / requestedHeight);
			const { height = 0, width } = fitWithinSource(size, source);

			if (width > 1) expect(Math.abs(width - size.width * scale)).toBeLessThanOrEqual(halfPixel);
			if (height > 1) {
				expect(Math.abs(height - requestedHeight * scale)).toBeLessThanOrEqual(halfPixel);
			}
		},
	);
});
