import { ImageLoaderBaseSchema, imageLoader } from '@xsynaptic/astro-image-loader';
import { DimensionsSchema, dimensionsPlugin } from '@xsynaptic/astro-image-loader/dimensions';
import { ExifGpsSchema, ExifSchema, exifPlugin } from '@xsynaptic/astro-image-loader/exif';
import { defineCollection } from 'astro:content';
import path from 'node:path';

// Validates both consumption modes: string `src` for URL/data rendering, and an `image()` field rendered through <Image>
// Extraction runs through the dimensions + exif plugins; the inline dataHandler adds the self-referential image path
const images = defineCollection({
	loader: imageLoader({
		base: 'src/images',
		plugins: [dimensionsPlugin(), exifPlugin({ gps: true })],
		dataHandler: ({ filePath }) => ({ image: `./${path.basename(filePath)}` }),
	}),
	schema: ({ image }) =>
		ImageLoaderBaseSchema.extend(DimensionsSchema.shape)
			.extend(ExifSchema.shape)
			.extend(ExifGpsSchema.shape)
			.extend({ image: image() }),
});

export const collections = { images };
