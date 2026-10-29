import type { AstroIntegration } from 'astro';
import type { Sharp } from 'sharp';

import { Buffer } from 'node:buffer';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { ImagePlaceholderOptions } from '../src/image-placeholders.js';

import imagePipeline from '../src/astro-integration.js';
import {
	getPlaceholder,
	getPlaceholderKey,
	imagePlaceholdersVariable,
} from '../src/image-placeholders.js';
import { readSourceSize } from '../src/image-render.js';
import { UserError } from '../src/user-error.js';

const mtime = new Date('2024-01-01T00:00:00Z');

let root: string;
let mediaPath: string;

const mosaic = { pixels: 250, quality: 10, saturation: 1.2 } satisfies ImagePlaceholderOptions;

async function startDev(
	placeholders: ImagePlaceholderOptions | undefined,
	cachePath = path.join(root, 'cache'),
) {
	type Hooks = AstroIntegration['hooks'];
	const { hooks }: { hooks: Hooks } = imagePipeline({
		cachePath,
		mediaPath,
		...(placeholders ? { placeholders } : {}),
	});

	await hooks['astro:config:setup']?.({
		command: 'dev',
		config: { experimental: { incrementalBuild: false } },
	} as unknown as Parameters<NonNullable<Hooks['astro:config:setup']>>[0]);
}

async function writeSource(id: string, image: Sharp) {
	const filePath = path.join(mediaPath, id);

	await image.toFile(filePath);
	await fs.utimes(filePath, mtime, mtime);

	return { ...(await readSourceSize(filePath)), id };
}

async function corruptKeepingStats(id: string) {
	const filePath = path.join(mediaPath, id);
	const { size } = await fs.stat(filePath);

	await fs.writeFile(filePath, Buffer.alloc(size));
	await fs.utimes(filePath, mtime, mtime);
}

function decodeDataUrl(dataUrl: string | undefined) {
	return sharp(Buffer.from(dataUrl?.replace(/^data:image\/webp;base64,/, '') ?? '', 'base64'));
}

function createBlock(background: string) {
	return sharp({ create: { background, channels: 3, height: 40, width: 60 } })
		.png()
		.toBuffer();
}

function createBlocks() {
	return Promise.all(['#cc3311', '#22aa55', '#1144cc', '#eecc22'].map(createBlock));
}

async function createBlockImage() {
	const [red, green, blue, yellow] = await createBlocks();

	return sharp({ create: { background: '#ffffff', channels: 3, height: 80, width: 120 } })
		.composite([
			{ input: red, left: 0, top: 0 },
			{ input: green, left: 60, top: 0 },
			{ input: blue, left: 0, top: 40 },
			{ input: yellow, left: 60, top: 40 },
		])
		.png();
}

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(tmpdir(), 'image-placeholders-'));
	mediaPath = path.join(root, 'media');
	await fs.mkdir(mediaPath);
});

afterEach(async () => {
	Reflect.deleteProperty(process.env, imagePlaceholdersVariable);
	await fs.rm(root, { force: true, recursive: true });
});

describe('getPlaceholder', () => {
	test('outside an Astro process with placeholders configured, throws a UserError', async () => {
		await expect(getPlaceholder({ height: 1, id: 'a.jpg', width: 1 })).rejects.toThrow(UserError);
	});

	test.each([
		[{ quality: 0 }, 'a whole quality from 1 to 100, not 0'],
		[{ quality: 2.5 }, 'a whole quality from 1 to 100, not 2.5'],
		[{ blur: 0.2 }, 'a blur sigma from 0.3 to 1000, not 0.2'],
		[{ blur: NaN }, 'a blur sigma from 0.3 to 1000, not NaN'],
		[{ saturation: -1 }, 'a saturation of 0 or more, not -1'],
		[{ saturation: Infinity }, 'a saturation of 0 or more, not Infinity'],
	])('refuses %j at setup', (override, message) => {
		expect(() =>
			imagePipeline({
				cachePath: 'cache',
				mediaPath: 'media',
				placeholders: { ...mosaic, ...override },
			}),
		).toThrow(message);
	});

	test('mosaic reproduces known bytes', async () => {
		await startDev(mosaic);

		const source = await writeSource('blocks.png', await createBlockImage());

		expect(await getPlaceholder(source)).toMatchInlineSnapshot(
			`"data:image/webp;base64,UklGRmoAAABXRUJQVlA4IF4AAAAQBACdASoTAA0AP3Gixli0rCgjsAgCkC4JbACdMoR4LfgAO3zfHsyHgAD+EC5u1GexXcpz1vvLQ48H56dPeP54PufEeZhfXMyLZSkV3zBt+jLM+yv0MI+ho37kAAAA"`,
		);
	});

	test('blur reproduces known bytes', async () => {
		await startDev({ blur: 3, pixels: 250, quality: 25, saturation: 1.2 });

		const source = await writeSource('blocks.png', await createBlockImage());

		expect(await getPlaceholder(source)).toMatchInlineSnapshot(
			`"data:image/webp;base64,UklGRlwAAABXRUJQVlA4IFAAAADwAwCdASoTAA0APyV8tlIuJ6UisAgBwCSJbACdMoHgAAUHaEuKYhqAAP5xXftbXrqVh5OECx6XNASx0t16zOemj+3Ba9Eqb85uEzYVM0OgAA=="`,
		);
	});

	test('a size with a height sets the grid ratio, and pixels override the configured count', async () => {
		await startDev({ blur: 3, pixels: 1024, quality: 25, saturation: 1.2 });

		const source = await writeSource('blocks.png', await createBlockImage());
		const cropped = await decodeDataUrl(
			await getPlaceholder(source, { size: { height: 100, width: 300 } }),
		).metadata();
		const finer = await decodeDataUrl(
			await getPlaceholder(source, { pixels: 1600, size: { height: 100, width: 100 } }),
		).metadata();
		const sourceRatio = await decodeDataUrl(
			await getPlaceholder(source, { pixels: 1536, size: { width: 300 } }),
		).metadata();

		expect(cropped).toMatchObject({ height: 18, width: 55 });
		expect(finer).toMatchObject({ height: 40, width: 40 });
		expect(sourceRatio).toMatchObject({ height: 32, width: 48 });
	});

	test.each([
		[{ size: { height: 0, width: 300 } }, "Image blocks.png can't have a 300x0 placeholder"],
		[{ size: { width: NaN } }, "Image blocks.png can't have a NaN wide placeholder"],
		[{ pixels: 0.5 }, 'Image blocks.png placeholders take a whole, positive pixel count, not 0.5'],
	])('refuses %j, naming the image', async (request, message) => {
		await startDev(mosaic);

		await expect(
			getPlaceholder({ height: 80, id: 'blocks.png', width: 120 }, request),
		).rejects.toThrow(message);
	});

	test('a dev restart without the option drops the old config', async () => {
		await startDev(mosaic);
		await startDev(undefined);

		await expect(getPlaceholder({ height: 1, id: 'a.jpg', width: 1 })).rejects.toThrow(UserError);
	});

	test('a config change mid-request lets the running request finish', async () => {
		await startDev(mosaic);

		const source = await writeSource('blocks.png', await createBlockImage());
		const running = getPlaceholder(source);

		await startDev(mosaic, path.join(root, 'other-cache'));

		const [first, second] = await Promise.all([running, getPlaceholder(source)]);

		expect(second).toBe(first);
	});

	test('a cache hit makes no second decode', async () => {
		await startDev(mosaic);

		const source = await writeSource('blocks.png', await createBlockImage());
		const first = await getPlaceholder(source);

		await corruptKeepingStats(source.id);

		expect(await getPlaceholder(source)).toBe(first);
	});

	test('a transparent source has no placeholder, and the absence is cached', async () => {
		await startDev(mosaic);

		const source = await writeSource(
			'cutout.png',
			sharp({
				create: {
					background: { alpha: 0.5, b: 0, g: 0, r: 0 },
					channels: 4,
					height: 80,
					width: 120,
				},
			}).png(),
		);

		expect(await getPlaceholder(source)).toBeUndefined();

		await corruptKeepingStats(source.id);

		expect(await getPlaceholder(source)).toBeUndefined();
	});

	test('an opaque source with an alpha channel has a placeholder', async () => {
		await startDev(mosaic);

		const blocks = await createBlockImage();
		const source = await writeSource('opaque.png', blocks.ensureAlpha(1));

		expect(await getPlaceholder(source)).toMatch(/^data:image\/webp;base64,/);
	});

	test('an EXIF-rotated source gets an oriented, portrait grid', async () => {
		await startDev(mosaic);

		const blocks = await createBlockImage();
		const source = await writeSource('rotated.jpg', blocks.jpeg().withMetadata({ orientation: 6 }));
		const placeholder = decodeDataUrl(await getPlaceholder(source));
		const { height, width } = await placeholder.metadata();
		const { data } = await placeholder.raw().toBuffer({ resolveWithObject: true });

		expect({ height, width }).toEqual({ height: 19, width: 13 });
		expect(data[0]).toBeLessThan(data[2] ?? 0);
	});

	test('a missing source throws', async () => {
		await startDev(mosaic);

		await expect(getPlaceholder({ height: 80, id: 'missing.jpg', width: 120 })).rejects.toThrow(
			'missing',
		);
	});
});

describe('getPlaceholderKey', () => {
	const fixed = { digest: 'a'.repeat(64), grid: { height: 13, width: 19 }, quality: 10 };

	test('stays pinned for a fixed input', () => {
		expect(getPlaceholderKey({ ...fixed, saturation: 1.2 })).toMatchInlineSnapshot(
			`"1458a0d6f6bea4a5"`,
		);
	});

	test('an absent saturation keys the same as 1, which sharp skips', () => {
		expect(getPlaceholderKey(fixed)).toBe(getPlaceholderKey({ ...fixed, saturation: 1 }));
	});

	test('a blur keys apart from none', () => {
		expect(getPlaceholderKey({ ...fixed, blur: 3 })).not.toBe(getPlaceholderKey(fixed));
	});
});
