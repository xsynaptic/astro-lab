import { afterEach, describe, expect, it, vi } from 'vitest';

import { assembleCatalog } from '../src/server/catalog.js';

const googleMeta = {
	familyMetadataList: [
		{
			axes: [],
			category: 'sans-serif',
			family: 'Inter',
			fonts: { '400': {} },
			popularity: 1,
			subsets: ['latin'],
			trending: 1,
		},
		{
			axes: [],
			category: 'sans-serif',
			family: 'Lato',
			fonts: { '400': {} },
			popularity: 2,
			subsets: ['latin'],
			trending: 2,
		},
	],
};

const fontsourceList = [
	{
		category: 'sans-serif',
		family: 'Inter',
		styles: ['normal'],
		subsets: ['latin', 'cyrillic'],
		variable: false,
		weights: [400],
	},
	{
		category: 'sans-serif',
		family: 'Roboto',
		styles: ['normal'],
		subsets: ['latin'],
		variable: false,
		weights: [400],
	},
];

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('assembleCatalog', () => {
	it('dedupes by family, unions providers and scripts, joins popularity, and sorts', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((input: unknown) => {
				const url = String(input);
				if (url.includes('fonts.google.com')) {
					return Promise.resolve(Response.json(googleMeta));
				}

				if (url.includes('api.fontsource.org')) {
					return Promise.resolve(Response.json(fontsourceList));
				}

				return Promise.reject(new Error(`unexpected fetch: ${url}`));
			}),
		);

		const catalog = await assembleCatalog(['google', 'fontsource']);

		expect(catalog.map((font) => font.family)).toEqual(['Inter', 'Lato', 'Roboto']);

		const inter = catalog.find((font) => font.family === 'Inter');
		expect(inter?.providers).toEqual(['google', 'fontsource']);
		expect(inter?.scripts).toEqual(['latin', 'cyrillic']);
		expect(inter?.popularity).toBe(1);

		// Roboto only exists on Fontsource and isn't in Google's rank so it has no popularity signal
		expect(catalog.find((font) => font.family === 'Roboto')?.popularity).toBeUndefined();
	});
});
