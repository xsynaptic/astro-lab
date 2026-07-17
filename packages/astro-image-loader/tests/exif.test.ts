import type { LoaderContext } from 'astro/loaders';

import { ExifTool } from 'exiftool-vendored';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { beforeAll, describe, expect, test, vi } from 'vitest';

import type { ImageLoaderPlugin } from '../src/types.js';

import { exifPlugin } from '../src/exif.js';

const logger = {
	error: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
} as unknown as LoaderContext['logger'];

// A generated JPEG with a known set of EXIF/GPS tags; shared across the extraction tests
let filePath: string;

beforeAll(async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'exif-'));

	filePath = path.join(dir, 'photo.jpg');

	await sharp({
		create: { background: { b: 40, g: 80, r: 120 }, channels: 3, height: 32, width: 48 },
	})
		.jpeg()
		.toFile(filePath);

	const exiftool = new ExifTool();

	try {
		await exiftool.write(
			filePath,
			{
				DateCreated: '2023:01:15',
				Description: 'A generated fixture',
				ExposureTime: '1/250',
				FNumber: 2.8,
				FocalLength: '35 mm',
				GPSLatitude: 35.6812,
				GPSLatitudeRef: 'N',
				GPSLongitude: 139.7671,
				GPSLongitudeRef: 'E',
				ISO: 200,
				LensModel: 'Test 35mm F2',
				Make: 'TestCam',
				Model: 'X100',
				Title: 'Test Photo',
			},
			{ writeArgs: ['-overwrite_original'] },
		);
	} finally {
		await exiftool.end();
	}
});

async function runPlugin(plugin: ImageLoaderPlugin) {
	await plugin.beforeLoad?.();

	try {
		return await plugin.dataHandler?.({
			filePath: 'photo.jpg',
			filePathRelative: filePath,
			fileUrl: pathToFileURL(filePath),
			id: 'photo.jpg',
			logger,
			modifiedTime: new Date(0),
		});
	} finally {
		await plugin.afterLoad?.();
	}
}

describe('exifPlugin', () => {
	test('extracts a curated set of EXIF fields, GPS stripped by default', async () => {
		const plugin = exifPlugin();
		const data = await runPlugin(plugin);

		expect(data).toMatchObject({
			aperture: '2.8',
			description: 'A generated fixture',
			iso: '200',
			make: 'TestCam',
			model: 'X100',
			title: 'Test Photo',
		});
		expect(String(data?.focalLength)).toContain('35');
		expect(typeof data?.exposureValue).toBe('string');

		// The messy fields: an ExifDate object coerced to an ISO string, and the lens fallback
		expect(data?.dateCreated).toBe('2023-01-15T00:00:00.000Z');
		expect(String(data?.lens)).toContain('35mm');

		// GPS is opt-in
		expect(data?.latitude).toBeUndefined();
		expect(data?.longitude).toBeUndefined();
		expect(plugin.extractionVersion).toBe('exif:v1:nogps');
		expect(Object.keys(plugin.schema?.shape ?? {})).not.toContain('latitude');
	});

	test('extracts GPS coordinates when gps is enabled', async () => {
		const plugin = exifPlugin({ gps: true });
		const data = await runPlugin(plugin);

		expect(data?.latitude).toBeCloseTo(35.6812, 3);
		expect(data?.longitude).toBeCloseTo(139.7671, 3);
		expect(plugin.extractionVersion).toBe('exif:v1:gps');
		expect(Object.keys(plugin.schema?.shape ?? {})).toContain('latitude');
	});
});
