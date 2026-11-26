import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { ImageManifest } from '../../src/image-state.js';

import { resolveImageEncoding } from '../../src/image-encoding.js';
import {
	findDistManifest,
	imageManifestVersion,
	writeBuildId,
	writeImageManifest,
} from '../../src/image-state.js';

let root: string;
let distPath: string;

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(tmpdir(), 'image-state-'));
	distPath = path.join(root, 'dist');

	await fs.mkdir(distPath);
});

afterEach(async () => {
	await fs.rm(root, { force: true, recursive: true });
});

describe('findDistManifest', () => {
	test('reads the manifest of the build dist names', async () => {
		const manifest = {
			buildId: 'live',
			cards: {},
			encoding: resolveImageEncoding(),
			keepIccProfile: false,
			limitInputPixels: 268_402_689,
			mediaPath: path.join(root, 'media'),
			renditions: { 'a-450.jpg': 'a.jpg' },
			version: imageManifestVersion,
		} satisfies ImageManifest;

		await writeImageManifest(root, manifest);
		await writeBuildId(distPath, 'live');

		expect(await findDistManifest({ distPath, storePath: root })).toStrictEqual(manifest);
	});

	test('is undefined when dist has no build id', async () => {
		expect(await findDistManifest({ distPath, storePath: root })).toBeUndefined();
	});

	test('is undefined when the build has no manifest', async () => {
		await writeBuildId(distPath, 'missing');

		expect(await findDistManifest({ distPath, storePath: root })).toBeUndefined();
	});
});
