import { mkdtempSync, rmSync } from 'node:fs';
import { readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { resolveImageEncoding } from '../src/image-encoding.js';
import { renderImage } from '../src/image-render.js';
import { createSourceFingerprints } from '../src/source-fingerprints.js';

let directory: string;
let sourcePath: string;

const mtime = new Date('2024-01-01T00:00:00Z');

beforeEach(async () => {
	directory = mkdtempSync(path.join(tmpdir(), 'source-fingerprints-'));
	sourcePath = path.join(directory, 'source.png');

	const image = await sharp({
		create: { background: '#336699', channels: 3, height: 20, width: 30 },
	})
		.png()
		.toBuffer();

	await writeFile(sourcePath, image);
	await utimes(sourcePath, mtime, mtime);
});

afterEach(() => {
	rmSync(directory, { force: true, recursive: true });
});

describe('createSourceFingerprints', () => {
	test('a source rotated by EXIF reports its oriented size, which a width-only render fills', async () => {
		const rotatedPath = path.join(directory, 'rotated.jpg');

		await sharp({ create: { background: '#336699', channels: 3, height: 200, width: 300 } })
			.jpeg()
			.withMetadata({ orientation: 6 })
			.toFile(rotatedPath);

		const fingerprint = await createSourceFingerprints(directory).get(rotatedPath);

		expect(fingerprint).toMatchObject({ height: 300, width: 200 });

		const { info } = await renderImage(rotatedPath, {
			encoding: resolveImageEncoding(),
			format: 'jpg',
			keepIccProfile: false,
			limitInputPixels: 268_402_689,
			pages: 1,
			width: 200,
		});

		expect(info).toMatchObject({ height: 300, width: 200 });
	});

	test('an unchanged mtime and size reuse the stored digest without reading the file', async () => {
		const first = await createSourceFingerprints(directory).get(sourcePath);
		const bytes = await readFile(sourcePath);
		const last = bytes.length - 1;

		bytes[last] = (bytes[last] ?? 0) ^ 0xff;
		await writeFile(sourcePath, bytes);
		await utimes(sourcePath, mtime, mtime);

		const second = await createSourceFingerprints(directory).get(sourcePath);

		expect(second?.sha256).toBe(first?.sha256);
	});

	test('a touched source is hashed again', async () => {
		const first = await createSourceFingerprints(directory).get(sourcePath);
		const bytes = await readFile(sourcePath);
		const last = bytes.length - 1;
		const touched = new Date(mtime.getTime() + 60_000);

		bytes[last] = (bytes[last] ?? 0) ^ 0xff;
		await writeFile(sourcePath, bytes);
		await utimes(sourcePath, touched, touched);

		const second = await createSourceFingerprints(directory).get(sourcePath);

		expect(second?.sha256).not.toBe(first?.sha256);
	});

	test("an animated source records its frame count beside one frame's size", async () => {
		const animatedPath = path.join(directory, 'animated.webp');
		const frames = await Promise.all(
			['#ff0000', '#00ff00', '#0000ff'].map((background) =>
				sharp({ create: { background, channels: 3, height: 20, width: 30 } })
					.png()
					.toBuffer(),
			),
		);

		await sharp(frames, { join: { animated: true } }).toFile(animatedPath);

		expect(await createSourceFingerprints(directory).get(animatedPath)).toMatchObject({
			height: 20,
			pages: 3,
			width: 30,
		});
		expect(await createSourceFingerprints(directory).get(sourcePath)).toMatchObject({ pages: 1 });
	});

	test('a store from before page counts drops its old table', async () => {
		const databasePath = path.join(directory, 'source-fingerprints.sqlite');
		const legacy = new DatabaseSync(databasePath);

		legacy.exec('CREATE TABLE fingerprints (path TEXT PRIMARY KEY)');
		legacy.close();
		createSourceFingerprints(directory).close();

		const database = new DatabaseSync(databasePath);
		const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();

		database.close();

		expect(tables).toEqual([{ name: 'source_fingerprints' }]);
	});
});
