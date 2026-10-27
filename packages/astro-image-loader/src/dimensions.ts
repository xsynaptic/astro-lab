import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { z } from 'zod';

import type { ImageLoaderPlugin } from './types.js';

export const DimensionsSchema = z.object({
	height: z.number(),
	width: z.number(),
});

/**
 * Pixel width and height via sharp; sharp is an optional peer dependency
 * Future sharp-derived extraction should extend this so it shares one decode rather than re-reading the file
 */
export function dimensionsPlugin(): ImageLoaderPlugin {
	return {
		dataHandler: async ({ fileUrl }) => {
			const imagePath = fileURLToPath(fileUrl);
			const { autoOrient } = await sharp(imagePath).metadata();

			// sharp types width/height as number but returns undefined for some inputs at runtime
			if (!Number.isFinite(autoOrient.width) || !Number.isFinite(autoOrient.height)) {
				throw new TypeError(`Could not read image dimensions for ${imagePath}`);
			}

			return { height: autoOrient.height, width: autoOrient.width };
		},
		extractionVersion: 'dimensions:v2',
		schema: DimensionsSchema,
	};
}
