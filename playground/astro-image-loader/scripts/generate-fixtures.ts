import { ExifTool } from 'exiftool-vendored';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Generates the CC0 sample images the playground loads
// Each is a solid-color JPEG stamped with distinct EXIF/GPS tags, so both plugins have real data to extract
// Self-generated means no licensing concerns; commit the output alongside this

const imagesDir = fileURLToPath(new URL('../src/images/', import.meta.url));

interface Fixture {
	background: { b: number; g: number; r: number };
	height: number;
	name: string;
	tags: Record<string, number | string>;
	width: number;
}

const fixtures: Array<Fixture> = [
	{
		background: { b: 140, g: 90, r: 40 },
		height: 426,
		name: 'harbor.jpg',
		tags: {
			Description: 'A quiet harbor',
			ExposureTime: '1/250',
			FNumber: 2.8,
			FocalLength: '23 mm',
			GPSLatitude: 22.2855,
			GPSLatitudeRef: 'N',
			GPSLongitude: 114.1577,
			GPSLongitudeRef: 'E',
			ISO: 200,
			Make: 'Fujifilm',
			Model: 'X100V',
			Title: 'Harbor at dusk',
		},
		width: 640,
	},
	{
		background: { b: 60, g: 120, r: 40 },
		height: 640,
		name: 'forest.jpg',
		tags: {
			Description: 'Morning light through the canopy',
			ExposureTime: '1/125',
			FNumber: 4,
			FocalLength: '50 mm',
			GPSLatitude: 35.3606,
			GPSLatitudeRef: 'N',
			GPSLongitude: 138.7274,
			GPSLongitudeRef: 'E',
			ISO: 400,
			Make: 'Nikon',
			Model: 'Z6',
			Title: 'Forest path',
		},
		width: 480,
	},
	{
		background: { b: 80, g: 150, r: 200 },
		height: 400,
		name: 'desert.jpg',
		tags: {
			Description: 'Rolling sand under a bright sky',
			ExposureTime: '1/500',
			FNumber: 8,
			FocalLength: '35 mm',
			ISO: 100,
			Make: 'Sony',
			Model: 'A7 IV',
			Title: 'Desert dunes',
		},
		width: 600,
	},
];

async function main() {
	await rm(imagesDir, { force: true, recursive: true });
	await mkdir(imagesDir, { recursive: true });

	const exiftool = new ExifTool();

	try {
		for (const fixture of fixtures) {
			const filePath = path.join(imagesDir, fixture.name);

			await sharp({
				create: {
					background: fixture.background,
					channels: 3,
					height: fixture.height,
					width: fixture.width,
				},
			})
				.jpeg()
				.toFile(filePath);

			await exiftool.write(filePath, fixture.tags, { writeArgs: ['-overwrite_original'] });

			console.log(`wrote ${fixture.name}`);
		}
	} finally {
		await exiftool.end();
	}
}

await main();
