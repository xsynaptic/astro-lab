import type { AstroIntegration } from 'astro';

import { describe, expect, test, vi } from 'vitest';

import pagefind from '../src/index.js';
import { parseOptions } from '../src/options.js';

vi.mock('../src/package-version.js', () => ({
	findPackageVersion: vi.fn(),
	getPagefindVersion: () => '1.7.0',
	versionDefine: '__XSYNAPTIC_PAGEFIND_VERSION__',
}));

const typo = { indexConfig: { excludeSelector: ['nav'] } };

describe('unknown indexConfig keys', () => {
	test.each(['1.6.0', '1.6.3', '1.5.2'])('fail on Pagefind %s, which drops them', (version) => {
		expect(() => parseOptions(typo, () => version)).toThrow('excludeSelector');
	});

	test.each(['1.7.0', '1.7.0-beta.1', '2.0.0'])('pass through on Pagefind %s', (version) => {
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
