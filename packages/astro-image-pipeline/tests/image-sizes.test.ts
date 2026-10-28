import { describe, expect, test } from 'vitest';

import { fitWithinSource, getSizedName } from '../src/image-sizes.js';

function makeSource(width: number, height: number, id = 'taiwan/taipei/some-image-1.jpg') {
	return { height, id, width };
}

describe('getSizedName', () => {
	const landscape = makeSource(4032, 3024);

	test.each([['1080x810', landscape, 1080, 810]])(
		'names an exact cover size: %s',
		(size, source, width, height) => {
			expect(getSizedName(source, { format: 'webp', height, width })).toBe(
				`taiwan/taipei/some-image-1-${size}.webp`,
			);
		},
	);

	test.each([[800, 500]])('a band clamped to a small source fits it: %i x %i', (width, height) => {
		expect(getSizedName(makeSource(800, 500), { format: 'jpg', height, width })).toBe(
			`taiwan/taipei/some-image-1-${String(width)}x${String(height)}.jpg`,
		);
	});

	test('a full-size download is width-only at the source width', () => {
		expect(getSizedName(landscape, { format: 'jpg', width: 4032 })).toBe(
			'taiwan/taipei/some-image-1-4032.jpg',
		);
	});

	test.each([{ width: 4033 }, { height: 501, width: 800 }])(
		'a size over the source throws rather than upscaling: %o',
		(size) => {
			expect(() => getSizedName(makeSource(800, 500), { format: 'jpg', ...size })).toThrow(
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
		expect(() => getSizedName(landscape, { format: 'jpg', ...size })).toThrow('whole pixels');
	});

	test.each(['trip/IMG 0001.jpg', 'trip/day, 2.jpg', "trip/it's.png", 'trip/../b.jpg'])(
		'a source path the name grammar would reject throws: %s',
		(id) => {
			expect(() =>
				getSizedName(makeSource(3600, 2400, id), { format: 'jpg', width: 1200 }),
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
					getSizedName(source, { format: 'jpg', ...fitWithinSource(size, source) }),
				).not.toThrow();
			}
		}
	});
});
