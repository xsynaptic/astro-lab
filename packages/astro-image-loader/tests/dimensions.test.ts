import type { LoaderContext } from 'astro/loaders';

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { describe, expect, test, vi } from 'vitest';

import { dimensionsPlugin } from '../src/dimensions.js';

const logger = {
	error: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
} as unknown as LoaderContext['logger'];

async function readDimensions(filePath: string) {
	return dimensionsPlugin().dataHandler?.({
		filePath: path.basename(filePath),
		filePathRelative: path.basename(filePath),
		fileUrl: pathToFileURL(filePath),
		id: path.basename(filePath),
		logger,
		modifiedTime: new Date(0),
	});
}

function createImage() {
	return sharp({
		create: { background: { b: 30, g: 20, r: 10 }, channels: 3, height: 240, width: 320 },
	});
}

describe('dimensionsPlugin', () => {
	test('extracts width and height via sharp', async () => {
		const dir = await mkdtemp(path.join(tmpdir(), 'dimensions-'));
		const filePath = path.join(dir, 'img.png');

		await createImage().png().toFile(filePath);

		expect(await readDimensions(filePath)).toEqual({ height: 240, width: 320 });
	});

	test('an EXIF rotation swaps width and height to the displayed size', async () => {
		const dir = await mkdtemp(path.join(tmpdir(), 'dimensions-'));
		const filePath = path.join(dir, 'img.jpg');

		await createImage().jpeg().withMetadata({ orientation: 6 }).toFile(filePath);

		expect(await readDimensions(filePath)).toEqual({ height: 320, width: 240 });
	});
});
