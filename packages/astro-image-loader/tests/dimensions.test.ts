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

describe('dimensionsPlugin', () => {
	test('extracts width and height via sharp', async () => {
		const dir = await mkdtemp(path.join(tmpdir(), 'dimensions-'));
		const filePath = path.join(dir, 'img.png');

		await sharp({
			create: { background: { b: 30, g: 20, r: 10 }, channels: 3, height: 240, width: 320 },
		})
			.png()
			.toFile(filePath);

		const plugin = dimensionsPlugin();
		const data = await plugin.dataHandler?.({
			filePath: 'img.png',
			filePathRelative: 'img.png',
			fileUrl: pathToFileURL(filePath),
			id: 'img.png',
			logger,
			modifiedTime: new Date(0),
		});

		expect(data).toEqual({ height: 240, width: 320 });
		expect(plugin.invalidationKey).toBe('dimensions:v1');
	});
});
