import { describe, expect, it } from 'vitest';

import type { CatalogFont, ProviderName } from '../src/shared/types.js';

import { filterFonts } from '../src/client/filter.js';

const font = (
	family: string,
	providers: Array<ProviderName>,
	scripts: Array<string>,
): CatalogFont => ({
	category: 'sans-serif',
	family,
	italic: false,
	providers,
	scripts,
	variable: false,
	weights: [400],
});

const families = (fonts: Array<CatalogFont>): Array<string> => fonts.map((entry) => entry.family);

describe('filterFonts', () => {
	const catalog = [
		font('Latin Only', ['google'], ['latin']),
		font(
			'Victor Mono',
			['fontsource'],
			['cyrillic', 'cyrillic-ext', 'greek', 'latin', 'vietnamese'],
		),
		font('Cyrillic Only', ['google'], ['cyrillic']),
	];

	it('returns every provider-matched font when no scripts are selected', () => {
		const result = filterFonts(catalog, new Set(['fontsource', 'google']), new Set());
		expect(families(result)).toEqual(['Latin Only', 'Victor Mono', 'Cyrillic Only']);
	});

	it('keeps a multi-script font when only one of its scripts is selected', () => {
		const result = filterFonts(catalog, new Set(['fontsource', 'google']), new Set(['latin']));
		expect(families(result)).toEqual(['Latin Only', 'Victor Mono']);
	});

	it('drops fonts that do not support the selected script', () => {
		const result = filterFonts(catalog, new Set(['fontsource', 'google']), new Set(['cyrillic']));
		expect(families(result)).toEqual(['Victor Mono', 'Cyrillic Only']);
	});

	it('excludes fonts whose only provider is inactive', () => {
		const result = filterFonts(catalog, new Set(['google']), new Set());
		expect(families(result)).toEqual(['Latin Only', 'Cyrillic Only']);
	});
});
