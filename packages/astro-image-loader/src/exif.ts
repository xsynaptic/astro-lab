import type { Tags } from 'exiftool-vendored';

import { ExifTool } from 'exiftool-vendored';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import type { ImageLoaderPlugin } from './types.js';

export const ExifSchema = z.object({
	aperture: z.string().optional(),
	dateCreated: z.coerce.date().optional(),
	description: z.string().optional(),
	exposureValue: z.string().optional(),
	focalLength: z.string().optional(),
	iso: z.string().optional(),
	lens: z.string().optional(),
	make: z.string().optional(),
	model: z.string().optional(),
	shutterSpeed: z.string().optional(),
	title: z.string().optional(),
});

export const ExifGpsSchema = z.object({
	latitude: z.number().optional(),
	longitude: z.number().optional(),
});

export interface ExifPluginOptions {
	/** Options forwarded to the ExifTool constructor */
	exiftoolOptions?: ConstructorParameters<typeof ExifTool>[0];
	/** Extract GPS latitude/longitude; off by default so location data never lands in the store unasked */
	gps?: boolean;
}

/**
 * Curated EXIF fields via exiftool-vendored, an optional peer dependency
 * GPS is stripped by default
 * One ExifTool instance is spawned per load batch and torn down afterward
 */
export function exifPlugin(options: ExifPluginOptions = {}): ImageLoaderPlugin {
	const isGps = options.gps ?? false;

	let exiftool: ExifTool | undefined;

	return {
		afterLoad: async () => {
			await exiftool?.end();
			exiftool = undefined;
		},
		beforeLoad: () => {
			exiftool = new ExifTool({
				ignoreZeroZeroLatLon: true,
				taskTimeoutMillis: 30_000,
				...options.exiftoolOptions,
			});
		},
		dataHandler: async ({ fileUrl }) => {
			if (!exiftool) throw new Error('exifPlugin: ExifTool was not initialized by beforeLoad');

			// Read via the absolute path; filePathRelative is for Astro's import resolution, not disk I/O
			const tags = await exiftool.read(fileURLToPath(fileUrl));

			return extractExifData(tags, isGps);
		},
		invalidationKey: `exif:v1:${isGps ? 'gps' : 'nogps'}`,
		schema: isGps ? ExifSchema.extend(ExifGpsSchema.shape) : ExifSchema,
	};
}

function extractExifData(tags: Tags, isGps: boolean): Record<string, unknown> {
	const aperture = getTagString(tags.FNumber);
	const shutterSpeed = getTagString(tags.ShutterSpeed);
	const dateCreated = tags.DateCreated ? tags.DateCreated.toString() : undefined;

	const data: Record<string, unknown> = {
		aperture,
		dateCreated: dateCreated ? new Date(dateCreated).toISOString() : undefined,
		description: getTagString(tags.Description),
		exposureValue: getExposureValue(aperture, shutterSpeed),
		focalLength: getTagString(tags.FocalLength),
		iso: getTagString(tags.ISO),
		lens: tags.LensID ?? getTagString(tags.LensModel),
		make: getTagString(tags.Make),
		model: getTagString(tags.Model),
		shutterSpeed,
		title: getTagString(tags.Title),
	};

	if (isGps && tags.GPSLatitude !== undefined && tags.GPSLongitude !== undefined) {
		data.latitude = Number(tags.GPSLatitude);
		data.longitude = Number(tags.GPSLongitude);
	}

	return data;
}

// Calculate EV using the formula EV = log2(N^2 / t)
function getExposureValue(aperture: string | undefined, shutterSpeed: string | undefined) {
	if (!aperture || !shutterSpeed) return;

	let shutterTime: number;

	if (shutterSpeed.includes('/')) {
		const [numerator, denominator] = shutterSpeed.split('/').map(Number);

		if (!numerator || !denominator) return;

		shutterTime = numerator / denominator;
	} else {
		shutterTime = Number(shutterSpeed);
	}

	return String(Math.log2(Number(aperture) ** 2 / shutterTime));
}

// String(undefined) yields the literal "undefined", which would poison downstream fallbacks
function getTagString(value: boolean | null | number | string | undefined): string | undefined {
	return value === undefined || value === null ? undefined : String(value);
}
