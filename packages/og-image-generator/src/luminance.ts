import sharp from 'sharp';

import type { ImageInput } from './image.js';

// A vertical band as [start, end] fractions of the height
export type LuminanceZone = [start: number, end: number];

// Mean perceived luminance (ITU-R BT.601, 0-255) per vertical zone
export async function analyzeLuminance(
	input: ImageInput,
	zones: Array<LuminanceZone>,
): Promise<Array<number>> {
	const { height, width } = await sharp(input).metadata();

	return Promise.all(
		zones.map(async ([start, end]) => {
			const top = Math.floor(height * start);
			const zoneHeight = Math.floor(height * (end - start));

			if (zoneHeight <= 0 || width <= 0) return 0;

			// Extract to a buffer first; chaining .extract().stats() stats the whole image, not the region
			const band = await sharp(input)
				.extract({ height: zoneHeight, left: 0, top, width })
				.toBuffer();
			const { channels } = await sharp(band).stats();
			const red = channels[0]?.mean ?? 0;
			const green = channels[1]?.mean ?? red;
			const blue = channels[2]?.mean ?? red;

			return Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
		}),
	);
}
