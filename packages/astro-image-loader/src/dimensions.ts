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
			const metadata = await sharp(imagePath).metadata();

			// sharp types width/height as number but returns undefined for some inputs at runtime
			if (!Number.isFinite(metadata.width) || !Number.isFinite(metadata.height)) {
				throw new TypeError(`Could not read image dimensions for ${imagePath}`);
			}

			return { height: metadata.height, width: metadata.width };
		},
		invalidationKey: 'dimensions:v1',
		schema: DimensionsSchema,
	};
}
