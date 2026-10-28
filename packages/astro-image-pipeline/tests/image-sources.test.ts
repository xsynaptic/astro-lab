import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createDirectorySources, listImageSources } from '../src/image-sources.js';

let mediaPath: string;

beforeEach(async () => {
	mediaPath = await fs.mkdtemp(path.join(tmpdir(), 'image-sources-'));
	await fs.mkdir(path.join(mediaPath, 'posts', '_drafts'), { recursive: true });

	for (const file of ['cover.JPG', 'posts/a.webp', 'posts/_drafts/b.png', 'posts/notes.txt']) {
		await fs.writeFile(path.join(mediaPath, file), '');
	}
});

afterEach(async () => {
	await fs.rm(mediaPath, { force: true, recursive: true });
});

describe('listImageSources', () => {
	test('lists every image the dev resolver would find, by media-relative path', async () => {
		const sources = await listImageSources(mediaPath);
		const resolver = createDirectorySources(mediaPath);

		expect([...sources].toSorted((first, second) => first.localeCompare(second))).toEqual([
			'cover.JPG',
			'posts/_drafts/b.png',
			'posts/a.webp',
		]);

		for (const source of sources) {
			expect(await resolver.resolve(source.replace(/\.[^./]+$/, ''))).toBe(source);
		}
	});

	test('lists nothing for a media directory that is not there', async () => {
		expect(await listImageSources(path.join(mediaPath, 'missing'))).toEqual(new Set());
	});
});
