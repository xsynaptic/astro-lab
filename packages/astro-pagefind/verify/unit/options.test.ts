import type { AstroIntegration } from 'astro';

import { fc, test } from '@fast-check/vitest';
import { describe, expect, vi } from 'vitest';

import pagefind from '../../src/index.js';
import { parseOptions } from '../../src/options.js';

vi.mock('../../src/package-version.js', () => ({
	findPackageVersion: vi.fn(),
	getPagefindVersion: () => '1.7.0',
	versionDefine: '__XSYNAPTIC_PAGEFIND_VERSION__',
}));

const typo = { indexConfig: { excludeSelector: ['nav'] } };

describe('unknown indexConfig keys', () => {
	test.each(['1.6.0', '1.5.2'])('fail on Pagefind %s, which drops them', (version) => {
		expect(() => parseOptions(typo, () => version)).toThrow('excludeSelector');
	});

	test.each(['1.7.0-beta.1', '2.0.0'])('pass through on Pagefind %s', (version) => {
		expect(parseOptions(typo, () => version)).toEqual({
			indexConfig: typo.indexConfig,
			unknownKeys: ['excludeSelector'],
		});
	});

	test('warn when the config is set up on a newer Pagefind', () => {
		type ConfigSetupParams = Parameters<
			NonNullable<AstroIntegration['hooks']['astro:config:setup']>
		>[0];
		const warn = vi.fn<(message: string) => void>();
		// @ts-expect-error a typed config gets this key from a newer Pagefind's types
		const integration = pagefind(typo);

		integration.hooks['astro:config:setup']?.({
			config: { output: 'static', root: new URL('file:///site/') },
			logger: { warn },
			updateConfig: vi.fn(),
		} as unknown as ConfigSetupParams);

		expect(warn).toHaveBeenCalledWith(expect.stringContaining('excludeSelector'));
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('Pagefind 1.7.0 unchecked'));
	});
});

const knownIndexConfig = fc.record(
	{
		excludeSelectors: fc.array(fc.constantFrom('nav', '.ad'), { maxLength: 2 }),
		forceLanguage: fc.constantFrom('en', 'zh'),
		includeCharacters: fc.constantFrom('', '-_'),
		keepIndexUrl: fc.boolean(),
		logfile: fc.constant('pagefind.log'),
		maxFragments: fc.nat(5),
		rootSelector: fc.constant('main'),
		verbose: fc.boolean(),
		writePlayground: fc.boolean(),
	},
	{ noNullPrototype: true, requiredKeys: [] },
);

const unknownKeyNames = fc.uniqueArray(
	fc.constantFrom(
		'excludeSelector',
		'Verbose',
		'root-selector',
		'constructor',
		'toString',
		'newKey',
	),
	{ maxLength: 3 },
);

function byName(first: string, second: string) {
	return first.localeCompare(second);
}

describe('parseOptions properties', () => {
	test('reports every unknown key and no known key', () => {
		let mixed = 0;

		fc.assert(
			fc.property(knownIndexConfig, unknownKeyNames, (known, unknown) => {
				const indexConfig = Object.fromEntries([
					...Object.entries(known),
					...unknown.map((key) => [key, true]),
				]);

				if (Object.keys(known).length > 0 && unknown.length > 0) mixed += 1;

				const { unknownKeys } = parseOptions({ indexConfig }, () => '1.7.0');

				expect(unknownKeys.toSorted(byName)).toEqual(unknown.toSorted(byName));
			}),
		);

		expect(mixed).toBeGreaterThan(0);
	});
});
