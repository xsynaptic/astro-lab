import { existsSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { CardRenderOptions, CardSource } from '../src/card-build.js';
import type { Card } from '../src/card-name.js';

import { getCardKey, prepareCardRender } from '../src/card-build.js';
import { resolveImageEncoding } from '../src/image-encoding.js';
import {
	getImageCachePaths,
	imageManifestVersion,
	writeBuildId,
	writeImageManifest,
} from '../src/image-state.js';

let root: string;
let mediaPath: string;
let distPath: string;
let directory: string;

const cards: Record<string, Card> = {
	'atlas.jpg': { input: { title: 'Atlas' } },
	'gone.jpg': { image: { path: 'gone.jpg' }, input: { title: 'Gone' } },
	'posts-a.jpg': { image: { path: 'photo.jpg' }, input: { title: 'A' } },
	'posts-b.jpg': { image: { path: 'photo.jpg' }, input: { title: 'B' } },
	'posts-c.jpg': { image: { path: 'photo.jpg', treatment: 'blur' }, input: { title: 'C' } },
};

async function writeBuild() {
	await writeImageManifest(root, {
		buildId: 'build',
		cards,
		encoding: resolveImageEncoding(),
		limitInputPixels: 268_402_689,
		mediaPath,
		renditions: {},
		version: imageManifestVersion,
	});
	await writeBuildId(distPath, 'build');
}

function createDecode() {
	return vi.fn((source: CardSource) =>
		Promise.resolve(`${source.path}:${source.treatment ?? 'plain'}`),
	);
}

function prepare(options: Partial<CardRenderOptions<string>> = {}) {
	return prepareCardRender<string>({
		cachePath: root,
		decode: createDecode(),
		distPath,
		render: (input, decoded = 'none') =>
			Promise.resolve(new TextEncoder().encode(`${JSON.stringify(input.title)}|${decoded}`)),
		templateVersion: 'template-1',
		...options,
	});
}

async function render(options: Partial<CardRenderOptions<string>> = {}) {
	const prepared = await prepare(options);

	return prepared.run({ onFailure: 'report' });
}

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(tmpdir(), 'card-build-'));
	mediaPath = path.join(root, 'media');
	distPath = path.join(root, 'dist');
	directory = getImageCachePaths(root).cardsPath;
	await fs.mkdir(mediaPath);
	await fs.mkdir(distPath);
	await sharp({ create: { background: '#336699', channels: 3, height: 40, width: 60 } })
		.jpeg()
		.toFile(path.join(mediaPath, 'photo.jpg'));
	await writeBuild();
});

afterEach(async () => {
	await fs.rm(root, { force: true, recursive: true });
});

describe('prepareCardRender', () => {
	test('knows the total and the source count before anything renders', async () => {
		const decode = createDecode();
		const prepared = await prepare({ decode });

		expect(prepared).toMatchObject({
			cards: ['atlas.jpg', 'gone.jpg', 'posts-a.jpg', 'posts-b.jpg', 'posts-c.jpg'],
			sources: 3,
			total: 5,
		});
		expect(decode).not.toHaveBeenCalled();
		expect(existsSync(directory)).toBe(false);
	});

	test('decodes once per photo and treatment, and hands each card its own decode', async () => {
		const decode = createDecode();
		const counts = await render({ decode });

		expect(decode).toHaveBeenCalledTimes(2);
		expect(counts).toMatchObject({ rendered: 4, written: 4 });
		expect(await fs.readFile(path.join(directory, 'posts-b.jpg'), 'utf8')).toBe(
			'"B"|photo.jpg:plain',
		);
		expect(await fs.readFile(path.join(directory, 'posts-c.jpg'), 'utf8')).toBe(
			'"C"|photo.jpg:blur',
		);
		expect(await fs.readFile(path.join(directory, 'atlas.jpg'), 'utf8')).toBe('"Atlas"|none');
	});

	test('a missing photo fails only its own cards', async () => {
		const counts = await render();

		expect(counts.failures).toStrictEqual([
			{ message: 'Missing image: gone.jpg', name: 'gone.jpg' },
		]);
		expect(existsSync(path.join(directory, 'gone.jpg'))).toBe(false);
	});

	test('omitting a missing photo draws its cards without art and names it with its cards', async () => {
		const prepared = await prepare({ missingImage: 'omit' });
		const counts = await prepared.run({ onFailure: 'report' });

		expect(prepared.missingImages).toEqual([{ cards: ['gone.jpg'], path: 'gone.jpg' }]);
		expect(counts.failures).toEqual([]);
		expect(await fs.readFile(path.join(prepared.directory, 'gone.jpg'), 'utf8')).toBe(
			'"Gone"|none',
		);
	});

	test('names every card a missing photo leaves without art, across treatments', async () => {
		await fs.rm(path.join(mediaPath, 'photo.jpg'));

		const prepared = await prepare({ missingImage: 'omit' });

		expect(prepared.missingImages).toEqual([
			{ cards: ['gone.jpg'], path: 'gone.jpg' },
			{ cards: ['posts-a.jpg', 'posts-b.jpg', 'posts-c.jpg'], path: 'photo.jpg' },
		]);
	});

	test('a photo that turns up later renders its card again', async () => {
		await render({ missingImage: 'omit' });
		await fs.copyFile(path.join(mediaPath, 'photo.jpg'), path.join(mediaPath, 'gone.jpg'));

		const prepared = await prepare({ missingImage: 'omit' });
		const counts = await prepared.run({ onFailure: 'report' });

		expect(prepared.missingImages).toEqual([]);
		expect(counts).toMatchObject({ fresh: 4, rendered: 1 });
	});

	test('a warm run decodes and renders nothing', async () => {
		await render();

		const decode = createDecode();
		const counts = await render({ decode });

		expect(decode).not.toHaveBeenCalled();
		expect(counts).toMatchObject({ fresh: 4, rendered: 0 });
	});

	test('a new template version renders every card again, and unchanged bytes stay on disk', async () => {
		await render();

		const counts = await render({ templateVersion: 'template-2' });

		expect(counts).toMatchObject({ fresh: 0, rendered: 4, written: 0 });
	});

	test('a replaced photo renders its cards again', async () => {
		await render();
		await sharp({ create: { background: '#993366', channels: 3, height: 40, width: 60 } })
			.jpeg()
			.toFile(path.join(mediaPath, 'photo.jpg'));

		const counts = await render();

		expect(counts).toMatchObject({ fresh: 1, rendered: 3 });
	});
});

describe('getCardKey', () => {
	test('stays pinned for a fixed input', () => {
		const key = getCardKey({
			digest: 'a'.repeat(64),
			engine: 'engine',
			image: { path: 'photo.jpg', treatment: 'blur' },
			input: { title: 'Atlas' },
			templateVersion: 'template-1',
		});

		expect(key).toBe('9a25dfc16fcec0e2');
	});
});
