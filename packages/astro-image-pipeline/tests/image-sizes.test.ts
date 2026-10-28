import { describe, expect, test } from 'vitest';

import { getSizedName } from '../src/image-sizes.js';

function makeSource(width: number, height: number, id = 'taiwan/taipei/some-image-1.jpg') {
	return { height, id, width };
}

describe('getSizedName', () => {
	const landscape = makeSource(4032, 3024);
	const portrait = makeSource(3024, 4032);
	const panorama = makeSource(6000, 1500);

	test.each([
		['1080x810', landscape, 1080, 810],
		['2400x1800', landscape, 2400, 1800],
		['810x1080', portrait, 810, 1080],
		['1200x1600', portrait, 1200, 1600],
		['1600x400', panorama, 1600, 400],
		['2400x600', panorama, 2400, 600],
		['400x300', landscape, 400, 300],
		['225x300', portrait, 225, 300],
		['1200x300', panorama, 1200, 300],
	])('names an exact cover size: %s', (size, source, width, height) => {
		expect(getSizedName(source, { format: 'webp', height, width })).toBe(
			`taiwan/taipei/some-image-1-${size}.webp`,
		);
	});

	test.each([
		[800, 267],
		[800, 333],
		[800, 500],
	])('a band clamped to a small source fits it: %i x %i', (width, height) => {
		expect(getSizedName(makeSource(800, 500), { format: 'jpg', height, width })).toBe(
			`taiwan/taipei/some-image-1-${String(width)}x${String(height)}.jpg`,
		);
	});

	test('a full-size download is width-only at the source width', () => {
		expect(getSizedName(landscape, { format: 'jpg', width: 4032 })).toBe(
			'taiwan/taipei/some-image-1-4032.jpg',
		);
	});

	test.each([{ width: 4033 }, { height: 501, width: 800 }, { height: 500, width: 801 }])(
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
