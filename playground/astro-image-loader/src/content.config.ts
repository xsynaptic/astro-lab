import { imageLoader, ImageLoaderBaseSchema } from '@xsynaptic/astro-image-loader';
import { dimensionsPlugin, DimensionsSchema } from '@xsynaptic/astro-image-loader/dimensions';
import { ExifGpsSchema, exifPlugin, ExifSchema } from '@xsynaptic/astro-image-loader/exif';
import { defineCollection } from 'astro:content';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSqliteCache } from './custom-cache';

// Validates both consumption modes: string `src` for URL/data rendering, and an `image()` field rendered through <Image>
// Extraction runs through the dimensions + exif plugins; the inline dataHandler adds the self-referential image path
// The cache option swaps the default JSONL store for a custom node:sqlite backend (see custom-cache.ts)
const images = defineCollection({
	loader: imageLoader({
		base: 'src/images',
		cache: createSqliteCache({
			filePath: fileURLToPath(
				new URL('../node_modules/.astro/image-cache.sqlite', import.meta.url),
			),
		}),
		dataHandler: ({ filePath }) => ({ image: `./${path.basename(filePath)}` }),
		plugins: [dimensionsPlugin(), exifPlugin({ gps: true })],
	}),
	schema: ({ image }) =>
		ImageLoaderBaseSchema.extend(DimensionsSchema.shape)
			.extend(ExifSchema.shape)
			.extend(ExifGpsSchema.shape)
			.extend({ image: image() }),
});

export const collections = { images };
