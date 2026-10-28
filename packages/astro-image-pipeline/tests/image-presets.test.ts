import { describe, expect, test } from 'vitest';

import { createImagePresets } from '../src/image-presets.js';

const widths = [450, 600, 900, 1200, 1800, 2400, 3600];

const { getName, getSize, getSizedName, getWidths } = createImagePresets({
	'card-hq': { aspectRatio: 3 / 2, fit: 'cover', format: 'jpg', widths: widths.slice(0, 5) },
	content: { fit: 'width', format: 'jpg', widths },
	feed: { fit: 'native', format: 'jpg', widths: [900, 1200] },
	hero: { aspectRatio: 3 / 2, fit: 'cover', format: 'webp', widths },
	popup: { aspectRatio: 3 / 2, fit: 'cover', format: 'webp', widths: [350, 700] },
});

function makeSource(width: number, height: number, id = 'taiwan/taipei/some-image-1.jpg') {
	return { height, id, width };
}

describe('getWidths', () => {
	test('drops a crop whose height the source cannot fill, even when the width fits', () => {
		expect(getWidths('card-hq', makeSource(960, 514))).toStrictEqual([450, 600]);
	});

	test('a width-only preset keeps every width up to and including the source width', () => {
		expect(getWidths('content', makeSource(1200, 2000))).toStrictEqual([450, 600, 900, 1200]);
	});
});

describe('getSize', () => {
	test('a crop larger than the source shrinks to the largest of its shape that fits', () => {
		expect(getSize('hero', 2400, makeSource(1800, 1200))).toStrictEqual({
			height: 1200,
			width: 1800,
		});
		expect(getSize('card-hq', 1200, makeSource(960, 514))).toStrictEqual({
			height: 514,
			width: 771,
		});
	});

	test('the feed keeps the source ratio, so a 4:3 image is not cropped to 3:2', () => {
		expect(getSize('feed', 1200, makeSource(4000, 3000))).toStrictEqual({
			height: 900,
			width: 1200,
		});
	});
});

describe('getName', () => {
	test('width-only and cropped names sit beside the source', () => {
		const source = makeSource(3600, 2400);

		expect(getName(source, 'content', 1200)).toBe('taiwan/taipei/some-image-1-1200.jpg');
		expect(getName(source, 'hero', 1200)).toBe('taiwan/taipei/some-image-1-1200x800.webp');
		expect(getName(source, 'popup', 350)).toBe('taiwan/taipei/some-image-1-350x233.webp');
		expect(getName(source, 'popup', 700)).toBe('taiwan/taipei/some-image-1-700x467.webp');
	});

	test('a preset width the source cannot fill throws rather than upscaling', () => {
		expect(() => getName(makeSource(960, 514), 'card-hq', 900)).toThrow(
			'no "card-hq" rendition 900 wide',
		);
	});

	test('a capped width is accepted only when it is the cap of a preset width', () => {
		const source = makeSource(960, 514);

		expect(getName(source, 'card-hq', 771)).toBe('taiwan/taipei/some-image-1-771x514.jpg');
		expect(() => getName(source, 'card-hq', 700)).toThrow('no "card-hq" rendition 700 wide');
	});

	test.each(['trip/IMG 0001.jpg', 'trip/day, 2.jpg', "trip/it's.png", 'trip/../b.jpg'])(
		'a source path the name grammar would reject throws at build time: %s',
		(id) => {
			expect(() => getName(makeSource(3600, 2400, id), 'content', 1200)).toThrow('rename the file');
		},
	);
});

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

	test('a source path the name grammar would reject throws', () => {
		expect(() =>
			getSizedName(makeSource(3600, 2400, 'trip/IMG 0001.jpg'), { format: 'jpg', width: 1200 }),
		).toThrow('rename the file');
	});

	test('a preset and a sized call for the same size and format share one name', () => {
		const source = makeSource(3600, 2400);

		expect(getSizedName(source, { format: 'webp', height: 800, width: 1200 })).toBe(
			getName(source, 'hero', 1200),
		);
		expect(getName(source, 'feed', 900)).toBe(getName(source, 'card-hq', 900));
	});
});
