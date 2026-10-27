import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { resolveImageEncoding } from '../src/image-encoding.js';
import { renderImage } from '../src/image-render.js';

let root: string;

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(tmpdir(), 'image-render-'));
});

afterEach(async () => {
	await fs.rm(root, { force: true, recursive: true });
});

async function writeSource(name: string, channels: 3 | 4, alpha = 1) {
	const sourcePath = path.join(root, name);

	await sharp({
		create: { background: { alpha, b: 255, g: 0, r: 0 }, channels, height: 40, width: 40 },
	})
		.png()
		.toFile(sourcePath);

	return sourcePath;
}

function renderJpeg(sourcePath: string) {
	return renderImage(sourcePath, {
		encoding: resolveImageEncoding(),
		format: 'jpg',
		limitInputPixels: 1_000_000,
		width: 20,
	});
}

async function getMeanColour(data: Uint8Array) {
	const { channels } = await sharp(data).stats();

	return channels.map((channel) => Math.round(channel.mean));
}

describe('renderImage', () => {
	test('a translucent source flattens onto white as JPEG', async () => {
		const { data } = await renderJpeg(await writeSource('translucent.png', 4, 0.3));
		const [red = 0, green = 0, blue = 0] = await getMeanColour(data);

		expect(red).toBeGreaterThan(160);
		expect(green).toBeGreaterThan(160);
		expect(blue).toBeGreaterThan(240);
	});

	test('an opaque source renders the same bytes with or without an alpha channel', async () => {
		const opaque = await renderJpeg(await writeSource('opaque.png', 3));
		const opaqueAlpha = await renderJpeg(await writeSource('opaque-alpha.png', 4));

		expect(Buffer.from(opaqueAlpha.data).equals(opaque.data)).toBe(true);
	});
});
