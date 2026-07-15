import { afterEach, describe, expect, it, vi } from 'vitest';

import { bunnyCatalog } from '../src/server/providers/bunny.js';
import { fontshareCatalog } from '../src/server/providers/fontshare.js';
import { fontsourceCatalog } from '../src/server/providers/fontsource.js';
import { googleCatalog } from '../src/server/providers/google.js';

function stubFetch(payload: unknown): void {
	vi.stubGlobal(
		'fetch',
		vi.fn(() => Promise.resolve(Response.json(payload))),
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('googleCatalog', () => {
	it('normalizes metadata (italic from `i` keys, variable from axes, weights from keys)', async () => {
		stubFetch({
			familyMetadataList: [
				{
					axes: [{}],
					category: 'Sans Serif',
					family: 'Inter',
					fonts: { '400': {}, '400i': {}, '700': {} },
					popularity: 1,
					subsets: ['latin', 'cyrillic'],
					trending: 2,
				},
			],
		});

		expect(await googleCatalog()).toEqual([
			{
				category: 'sans-serif',
				family: 'Inter',
				italic: true,
				popularity: 1,
				providers: ['google'],
				scripts: ['latin', 'cyrillic'],
				trending: 2,
				variable: true,
				weights: [400, 700],
			},
		]);
	});
});

describe('fontsourceCatalog', () => {
	it('maps fonts and drops the icons category', async () => {
		stubFetch([
			{
				category: 'sans-serif',
				family: 'Roboto',
				styles: ['normal', 'italic'],
				subsets: ['latin'],
				variable: false,
				weights: [400, 700],
			},
			{
				category: 'icons',
				family: 'Material Icons',
				styles: ['normal'],
				subsets: ['latin'],
				variable: false,
				weights: [400],
			},
		]);

		expect(await fontsourceCatalog()).toEqual([
			{
				category: 'sans-serif',
				family: 'Roboto',
				italic: true,
				providers: ['fontsource'],
				scripts: ['latin'],
				variable: false,
				weights: [400, 700],
			},
		]);
	});
});

describe('bunnyCatalog', () => {
	it('maps the keyed list, reading scripts from variant keys', async () => {
		stubFetch({
			'1': {
				category: 'sans-serif',
				familyName: 'Poppins',
				isVariable: true,
				styles: ['normal', 'italic'],
				variants: { cyrillic: 1, latin: 1 },
				weights: [400, 500],
			},
		});

		expect(await bunnyCatalog()).toEqual([
			{
				category: 'sans-serif',
				family: 'Poppins',
				italic: true,
				providers: ['bunny'],
				scripts: ['cyrillic', 'latin'],
				variable: true,
				weights: [400, 500],
			},
		]);
	});
});

describe('fontshareCatalog', () => {
	it('dedupes weights across styles and ranks popularity by views', async () => {
		stubFetch({
			fonts: [
				{
					category: 'sans-serif',
					name: 'Satoshi',
					script: 'latin',
					styles: [
						{ is_italic: false, is_variable: true, weight: { weight: 400 } },
						{ is_italic: true, is_variable: false, weight: { weight: 700 } },
					],
					views: 100,
					views_recent: 50,
				},
			],
			has_more: false,
		});

		expect(await fontshareCatalog()).toEqual([
			{
				category: 'sans-serif',
				family: 'Satoshi',
				italic: true,
				popularity: 1,
				providers: ['fontshare'],
				scripts: ['latin'],
				trending: 1,
				variable: true,
				weights: [400, 700],
			},
		]);
	});
});
