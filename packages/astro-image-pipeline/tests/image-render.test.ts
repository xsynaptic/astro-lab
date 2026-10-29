import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { resolveImageEncoding } from '../src/image-encoding.js';
import { renderImage } from '../src/image-render.js';

let root: string;

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(tmpdir(), 'image-render-'));
});

afterEach(async () => {
	await fs.rm(root, { force: true, recursive: true });
});

async function writeSource(name: string, channels: 3 | 4, alpha = 1) {
	const sourcePath = path.join(root, name);

	await sharp({
		create: { background: { alpha, b: 255, g: 0, r: 0 }, channels, height: 40, width: 40 },
	})
		.png()
		.toFile(sourcePath);

	return sourcePath;
}

function renderJpeg(sourcePath: string) {
	return renderImage(sourcePath, {
		encoding: resolveImageEncoding(),
		format: 'jpg',
		keepIccProfile: false,
		limitInputPixels: 1_000_000,
		pages: 1,
		width: 20,
	});
}

async function writeAnimatedSource(name: string) {
	const sourcePath = path.join(root, name);
	const frames = await Promise.all(
		['#ff0000', '#00ff00', '#0000ff'].map((background) =>
			sharp({ create: { background, channels: 3, height: 100, width: 200 } })
				.png()
				.toBuffer(),
		),
	);

	await sharp(frames, { join: { animated: true } }).toFile(sourcePath);

	return sourcePath;
}

function renderAnimated(sourcePath: string, format: 'jpg' | 'webp', height?: number) {
	return renderImage(sourcePath, {
		encoding: resolveImageEncoding(),
		format,
		height,
		keepIccProfile: false,
		limitInputPixels: 1_000_000,
		pages: 3,
		width: 100,
	});
}

async function writeDisplayP3Source() {
	const sourcePath = path.join(root, 'display-p3.png');

	await sharp({ create: { background: '#ff3300', channels: 3, height: 40, width: 40 } })
		.withIccProfile('p3')
		.png()
		.toFile(sourcePath);

	return sourcePath;
}

async function getMeanColour(data: Uint8Array) {
	const { channels } = await sharp(data).stats();

	return channels.map((channel) => Math.round(channel.mean));
}

describe('renderImage', () => {
	test('a translucent source flattens onto white as JPEG', async () => {
		const { data } = await renderJpeg(await writeSource('translucent.png', 4, 0.3));
		const [red = 0, green = 0, blue = 0] = await getMeanColour(data);

		expect(red).toBeGreaterThan(160);
		expect(green).toBeGreaterThan(160);
		expect(blue).toBeGreaterThan(240);
	});

	test.each([
		{ format: 'png', type: 'png' },
		{ format: 'webp', type: 'webp' },
		{ format: 'avif', type: 'heif' },
	] as const)('a translucent source keeps its alpha as $format', async ({ format, type }) => {
		const { data, info } = await renderImage(await writeSource('translucent.png', 4, 0.3), {
			encoding: resolveImageEncoding(),
			format,
			keepIccProfile: false,
			limitInputPixels: 1_000_000,
			pages: 1,
			width: 20,
		});
		const metadata = await sharp(data).metadata();
		const { channels } = await sharp(data).stats();

		expect(info).toMatchObject({ height: 20, width: 20 });
		expect(metadata).toMatchObject({ format: type, hasAlpha: true });
		expect(Math.round(channels[3]?.mean ?? 255)).toBeLessThan(100);
	});

	test('an opaque source renders the same bytes with or without an alpha channel', async () => {
		const opaque = await renderJpeg(await writeSource('opaque.png', 3));
		const opaqueAlpha = await renderJpeg(await writeSource('opaque-alpha.png', 4));

		expect(Buffer.from(opaqueAlpha.data).equals(opaque.data)).toBe(true);
	});
});

describe('renderImage from an animated source', () => {
	test.each([
		{ height: undefined, pageHeight: 50 },
		{ height: 40, pageHeight: 40 },
	])('WebP keeps every frame at frame height $pageHeight', async ({ height, pageHeight }) => {
		const { data, info } = await renderAnimated(
			await writeAnimatedSource('animated.webp'),
			'webp',
			height,
		);

		expect(info).toMatchObject({ pageHeight, pages: 3, width: 100 });
		expect(await sharp(data).metadata()).toMatchObject({ height: pageHeight, pages: 3 });
	});

	test('JPEG takes the first frame instead of stacking them', async () => {
		const { data, info } = await renderAnimated(await writeAnimatedSource('animated.gif'), 'jpg');
		const [red = 0, green = 0] = await getMeanColour(data);

		expect(info).toMatchObject({ height: 50, width: 100 });
		expect(red).toBeGreaterThan(200);
		expect(green).toBeLessThan(50);
	});

	test('WebP from a GIF loops forever', async () => {
		const { data } = await renderAnimated(await writeAnimatedSource('animated.gif'), 'webp');

		expect(await sharp(data).metadata()).toMatchObject({ loop: 0, pages: 3 });
	});
});

describe('renderImage colour profiles', () => {
	test.each(['jpg', 'png', 'webp', 'avif'] as const)(
		'a Display P3 source keeps its profile as %s when asked',
		async (format) => {
			const sourcePath = await writeDisplayP3Source();
			const { icc: sourceProfile } = await sharp(sourcePath).metadata();
			const render = {
				encoding: resolveImageEncoding(),
				format,
				limitInputPixels: 1_000_000,
				pages: 1,
				width: 20,
			};
			const kept = await renderImage(sourcePath, { ...render, keepIccProfile: true });
			const converted = await renderImage(sourcePath, { ...render, keepIccProfile: false });

			const keptMetadata = await sharp(kept.data).metadata();
			const convertedMetadata = await sharp(converted.data).metadata();

			expect(sourceProfile).toBeDefined();
			expect(keptMetadata.icc).toEqual(sourceProfile);
			expect(convertedMetadata.icc).toBeUndefined();
		},
	);
});
