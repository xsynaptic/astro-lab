import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExifTool } from 'exiftool-vendored';
import sharp from 'sharp';

// Generates the CC0 sample images the playground loads
// Each is a solid-color JPEG stamped with distinct EXIF/GPS tags, so both plugins have real data to extract
// Self-generated means no licensing concerns; commit the output alongside this

const imagesDir = fileURLToPath(new URL('../src/images/', import.meta.url));

interface Fixture {
	name: string;
	background: { r: number; g: number; b: number };
	width: number;
	height: number;
	tags: Record<string, string | number>;
}

const fixtures: Array<Fixture> = [
	{
		name: 'harbor.jpg',
		background: { r: 40, g: 90, b: 140 },
		width: 640,
		height: 426,
		tags: {
			Title: 'Harbor at dusk',
			Description: 'A quiet harbor',
			Make: 'Fujifilm',
			Model: 'X100V',
			FNumber: 2.8,
			ExposureTime: '1/250',
			ISO: 200,
			FocalLength: '23 mm',
			GPSLatitude: 22.2855,
			GPSLatitudeRef: 'N',
			GPSLongitude: 114.1577,
			GPSLongitudeRef: 'E',
		},
	},
	{
		name: 'forest.jpg',
		background: { r: 40, g: 120, b: 60 },
		width: 480,
		height: 640,
		tags: {
			Title: 'Forest path',
			Description: 'Morning light through the canopy',
			Make: 'Nikon',
			Model: 'Z6',
			FNumber: 4,
			ExposureTime: '1/125',
			ISO: 400,
			FocalLength: '50 mm',
			GPSLatitude: 35.3606,
			GPSLatitudeRef: 'N',
			GPSLongitude: 138.7274,
			GPSLongitudeRef: 'E',
		},
	},
	{
		name: 'desert.jpg',
		background: { r: 200, g: 150, b: 80 },
		width: 600,
		height: 400,
		tags: {
			Title: 'Desert dunes',
			Description: 'Rolling sand under a bright sky',
			Make: 'Sony',
			Model: 'A7 IV',
			FNumber: 8,
			ExposureTime: '1/500',
			ISO: 100,
			FocalLength: '35 mm',
		},
	},
];

async function main() {
	await rm(imagesDir, { recursive: true, force: true });
	await mkdir(imagesDir, { recursive: true });

	const exiftool = new ExifTool();

	try {
		for (const fixture of fixtures) {
			const filePath = path.join(imagesDir, fixture.name);

			await sharp({
				create: {
					width: fixture.width,
					height: fixture.height,
					channels: 3,
					background: fixture.background,
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
