import type { GetImageResult, ImageMetadata } from 'astro';

import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import { anchorDateOnly, toSyndicationImage } from '../src/index.js';

const millisecondsPerDay = 86_400_000;

const dayIndex = fc.integer({ max: 47_000, min: -10_000 });

describe('anchorDateOnly', () => {
	test('a date-only value moves to midnight at the given offset', () => {
		expect(anchorDateOnly(new Date('2026-06-08'), { utcOffsetHours: 8 })).toStrictEqual(
			new Date('2026-06-07T16:00:00Z'),
		);
	});

	test.prop([dayIndex, fc.integer({ max: 14, min: -12 })])(
		'any midnight UTC shifts by exactly the offset',
		(day, utcOffsetHours) => {
			const date = new Date(day * millisecondsPerDay);

			expect(date.getTime() - anchorDateOnly(date, { utcOffsetHours }).getTime()).toBe(
				utcOffsetHours * 3_600_000,
			);
		},
	);

	test.prop([dayIndex, fc.integer({ max: millisecondsPerDay - 1, min: 1 })])(
		'a value with any time of day past midnight UTC is left alone',
		(day, timeOfDay) => {
			const date = new Date(day * millisecondsPerDay + timeOfDay);

			expect(anchorDateOnly(date, { utcOffsetHours: 8 }).getTime()).toBe(date.getTime());
		},
	);

	test('a full timestamp written by an author keeps its time', () => {
		const date = new Date('2026-06-08T14:30:00Z');

		expect(anchorDateOnly(date, { utcOffsetHours: 8 })).toStrictEqual(date);
	});
});

const source = {
	format: 'jpg',
	height: 2000,
	src: '/src/media/lukang.jpg',
	width: 3000,
} satisfies ImageMetadata;

function getImageResult({
	format = 'jpg',
	height,
	src = source,
	width,
}: {
	format?: string;
	height: number;
	src?: ImageMetadata | string;
	width: number;
}) {
	return {
		attributes: { decoding: 'async', height, loading: 'lazy', width },
		options: { format, src, width },
		src: '/_astro/lukang.hash.jpg',
	} satisfies Pick<GetImageResult, 'attributes' | 'options' | 'src'>;
}

describe('toSyndicationImage', () => {
	test('reads the rendered size, the MIME type and the src', () => {
		expect(
			toSyndicationImage(getImageResult({ height: 800, width: 1200 }), { alt: 'Lukang' }),
		).toStrictEqual({
			alt: 'Lukang',
			height: 800,
			type: 'image/jpeg',
			url: '/_astro/lukang.hash.jpg',
			width: 1200,
		});
	});

	test('a request wider than the source reports the source size, since nothing is enlarged', () => {
		const image = toSyndicationImage(getImageResult({ height: 2400, width: 3600 }), { alt: '' });

		expect([image.width, image.height]).toStrictEqual([3000, 2000]);
	});

	test('a remote source reports the size as requested', () => {
		const image = toSyndicationImage(
			getImageResult({ height: 2400, src: 'https://img.example.com/a.jpg', width: 3600 }),
			{ alt: '' },
		);

		expect([image.width, image.height]).toStrictEqual([3600, 2400]);
	});

	test('maps each output format to its MIME type', () => {
		const types = ['avif', 'jpeg', 'png', 'svg', 'webp'].map(
			(format) =>
				toSyndicationImage(getImageResult({ format, height: 8, width: 12 }), { alt: '' }).type,
		);

		expect(types).toStrictEqual([
			'image/avif',
			'image/jpeg',
			'image/png',
			'image/svg+xml',
			'image/webp',
		]);
	});

	test('an unknown format throws rather than guessing a MIME type', () => {
		expect(() =>
			toSyndicationImage(getImageResult({ format: 'heic', height: 8, width: 12 }), { alt: '' }),
		).toThrow('no MIME type is known for image format `heic`');
	});
});
