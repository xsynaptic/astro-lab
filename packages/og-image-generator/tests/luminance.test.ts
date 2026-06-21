import sharp from 'sharp';
import { describe, expect, test } from 'vitest';

import { analyzeLuminance } from '../src/index.js';

async function brightTopDarkBottom(): Promise<Buffer> {
	const white = await sharp({
		create: { background: { b: 255, g: 255, r: 255 }, channels: 3, height: 50, width: 100 },
	})
		.png()
		.toBuffer();
	const black = await sharp({
		create: { background: { b: 0, g: 0, r: 0 }, channels: 3, height: 50, width: 100 },
	})
		.png()
		.toBuffer();

	return sharp({
		create: { background: { b: 0, g: 0, r: 0 }, channels: 3, height: 100, width: 100 },
	})
		.composite([
			{ input: white, left: 0, top: 0 },
			{ input: black, left: 0, top: 50 },
		])
		.png()
		.toBuffer();
}

describe('analyzeLuminance', () => {
	test('reads bright and dark zones independently', async () => {
		const image = await brightTopDarkBottom();

		const [topLuminance, bottomLuminance] = await analyzeLuminance(image, [
			[0, 0.5],
			[0.5, 1],
		]);

		expect(topLuminance).toBeGreaterThan(250);
		expect(bottomLuminance).toBeLessThan(5);
	});

	test('returns one value per zone', async () => {
		const image = await brightTopDarkBottom();

		const result = await analyzeLuminance(image, [[0, 1]]);

		expect(result).toHaveLength(1);
		expect(result[0]).toBeGreaterThan(120);
		expect(result[0]).toBeLessThan(135);
	});
});
