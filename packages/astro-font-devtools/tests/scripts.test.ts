import { describe, expect, it } from 'vitest';

import type { CatalogFont } from '../src/shared/types.js';

import { scriptLabel, sortedScripts, toBaseScripts } from '../src/client/scripts.js';

const withScripts = (scripts: Array<string>): CatalogFont => ({
	category: 'sans-serif',
	family: 'x',
	italic: false,
	providers: ['google'],
	scripts,
	variable: false,
	weights: [400],
});

describe('scriptLabel', () => {
	it('uses the known label, else title-cases the raw name', () => {
		expect(scriptLabel('latin')).toBe('Latin');
		expect(scriptLabel('chinese-hongkong')).toBe('Chinese (Hong Kong)');
		expect(scriptLabel('elder-futhark')).toBe('Elder Futhark');
	});
});

describe('toBaseScripts', () => {
	it('drops auxiliary subsets and folds -ext / vietnamese into their base', () => {
		expect(toBaseScripts(['latin-ext', 'vietnamese', 'emoji', 'cyrillic'])).toEqual([
			'latin',
			'cyrillic',
		]);
	});
});

describe('sortedScripts', () => {
	it('orders by family count and drops scripts below the threshold', () => {
		const fonts = [
			...Array.from({ length: 5 }, () => withScripts(['latin'])),
			withScripts(['cyrillic']),
		];
		expect(sortedScripts(fonts)).toEqual(['latin']);
	});
});
