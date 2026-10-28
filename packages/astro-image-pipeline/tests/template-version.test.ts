import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { hashTemplateVersion } from '../src/template-version.js';

let directory: string;
let element: URL;

beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(tmpdir(), 'template-version-'));
	element = pathToFileURL(path.join(directory, 'element.tsx'));
	await fs.writeFile(element, 'export const title = 1;');
});

afterEach(async () => {
	await fs.rm(directory, { force: true, recursive: true });
});

describe('hashTemplateVersion', () => {
	test('moves when a template file changes', async () => {
		const options = {
			files: [element],
			from: import.meta.url,
			packages: ['sharp'],
			parts: [1200, 630],
		};
		const before = hashTemplateVersion(options);

		await fs.writeFile(element, 'export const title = 2;');

		expect(hashTemplateVersion(options)).not.toBe(before);
	});

	test('moves with the card size', () => {
		const options = { files: [element], from: import.meta.url };

		expect(hashTemplateVersion({ ...options, parts: [1200, 630] })).not.toBe(
			hashTemplateVersion({ ...options, parts: [1200, 600] }),
		);
	});

	test('refuses a package that is not installed', () => {
		expect(() =>
			hashTemplateVersion({
				files: [element],
				from: import.meta.url,
				packages: ['takumi-missing'],
			}),
		).toThrow('takumi-missing');
	});
});
