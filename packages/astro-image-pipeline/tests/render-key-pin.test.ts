import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { ImageManifest } from '../src/image-state.js';

import { readFileRecords } from '../src/file-store.js';
import { getRenditionKey, prepareRenditionRender } from '../src/image-build.js';
import { resolveImageEncoding } from '../src/image-encoding.js';
import { engineId } from '../src/image-render.js';
import { imageManifestVersion, writeBuildId, writeImageManifest } from '../src/image-state.js';

const pinned = [
	{ format: 'jpg', key: 'd6eb97c4aab5386e', name: 'still-1200.jpg', width: 1200 },
	{ format: 'webp', key: '975226198fee1c90', name: 'still-1200.webp', width: 1200 },
	{ format: 'jpg', height: 800, key: '164951ca0df1da16', name: 'still-1200x800.jpg', width: 1200 },
] as const;

const encoding = resolveImageEncoding();

let root: string;

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(tmpdir(), 'render-key-pin-'));
});

afterEach(async () => {
	await fs.rm(root, { force: true, recursive: true });
});

describe('render keys', () => {
	test.each(pinned)('$name keeps its key under default encoding', (rendition) => {
		const key = getRenditionKey({
			digest: 'a'.repeat(64),
			encoding: encoding[rendition.format],
			engine: 'engine',
			format: rendition.format,
			height: 'height' in rendition ? rendition.height : undefined,
			width: rendition.width,
		});

		expect(key).toBe(rendition.key);
	});

	test('keeping the colour profile changes the key, and leaving it off does not', () => {
		const [rendition] = pinned;
		const key = {
			digest: 'a'.repeat(64),
			encoding: encoding[rendition.format],
			engine: 'engine',
			format: rendition.format,
			width: rendition.width,
		};

		expect(getRenditionKey({ ...key, keepIccProfile: false })).toBe(rendition.key);
		expect(getRenditionKey({ ...key, keepIccProfile: true })).not.toBe(rendition.key);
	});

	test('a still source renders under the keys its name and digest alone give', async () => {
		const mediaPath = path.join(root, 'media');
		const distPath = path.join(root, 'dist');
		const sourceFilePath = path.join(mediaPath, 'still.jpg');

		await fs.mkdir(mediaPath, { recursive: true });
		await fs.mkdir(distPath);
		await sharp({ create: { background: '#336699', channels: 3, height: 1000, width: 1500 } })
			.jpeg()
			.toFile(sourceFilePath);

		const manifest = {
			buildId: 'build',
			cards: {},
			encoding,
			keepIccProfile: false,
			limitInputPixels: 268_402_689,
			mediaPath,
			renditions: Object.fromEntries(pinned.map(({ name }) => [name, 'still.jpg'])),
			version: imageManifestVersion,
		} satisfies ImageManifest;

		await writeImageManifest(root, manifest);
		await writeBuildId(distPath, manifest.buildId);

		const prepared = await prepareRenditionRender({ distPath, storePath: root });

		await prepared.run();

		const digest = createHash('sha256')
			.update(await fs.readFile(sourceFilePath))
			.digest('hex');
		const records = await readFileRecords(prepared.directory);

		for (const rendition of pinned) {
			expect(records.get(rendition.name)?.key).toBe(
				getRenditionKey({
					digest,
					encoding: encoding[rendition.format],
					engine: engineId,
					format: rendition.format,
					height: 'height' in rendition ? rendition.height : undefined,
					width: rendition.width,
				}),
			);
		}
	});

	test('an animated source keys its page count, and its WebP keeps every frame', async () => {
		const mediaPath = path.join(root, 'media');
		const distPath = path.join(root, 'dist');
		const sourceFilePath = path.join(mediaPath, 'animated.gif');
		const frames = await Promise.all(
			['#ff0000', '#00ff00', '#0000ff'].map((background) =>
				sharp({ create: { background, channels: 3, height: 100, width: 200 } })
					.png()
					.toBuffer(),
			),
		);

		await fs.mkdir(mediaPath, { recursive: true });
		await fs.mkdir(distPath);
		await sharp(frames, { join: { animated: true } }).toFile(sourceFilePath);

		const manifest = {
			buildId: 'build',
			cards: {},
			encoding,
			keepIccProfile: false,
			limitInputPixels: 268_402_689,
			mediaPath,
			renditions: { 'animated-100.jpg': 'animated.gif', 'animated-100x40.webp': 'animated.gif' },
			version: imageManifestVersion,
		} satisfies ImageManifest;

		await writeImageManifest(root, manifest);
		await writeBuildId(distPath, manifest.buildId);

		const prepared = await prepareRenditionRender({ distPath, storePath: root });

		expect(await prepared.run()).toMatchObject({ rendered: 2 });

		const digest = createHash('sha256')
			.update(await fs.readFile(sourceFilePath))
			.digest('hex');
		const records = await readFileRecords(prepared.directory);
		const stillKey = getRenditionKey({
			digest,
			encoding: encoding.jpg,
			engine: engineId,
			format: 'jpg',
			width: 100,
		});
		const webp = await sharp(path.join(prepared.directory, 'animated-100x40.webp')).metadata();

		expect(records.get('animated-100.jpg')?.key).not.toBe(stillKey);
		expect(records.get('animated-100.jpg')?.key).toBe(
			getRenditionKey({
				digest,
				encoding: encoding.jpg,
				engine: engineId,
				format: 'jpg',
				pages: 3,
				width: 100,
			}),
		);
		expect(webp).toMatchObject({ height: 40, pages: 3, width: 100 });
	});
});
