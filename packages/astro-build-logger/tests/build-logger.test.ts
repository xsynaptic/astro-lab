import { describe, expect, test } from 'vitest';

import buildLogger from '../src/index.js';

describe('buildLogger options', () => {
	test('accepts no options', () => {
		expect(buildLogger().name).toBe('@xsynaptic/astro-build-logger');
	});

	test('refuses a misspelled key when the config loads', () => {
		// @ts-expect-error a typo that an untyped astro.config.mjs would pass through
		expect(() => buildLogger({ logFile: 'build.jsonl' })).toThrow('Unrecognized key: "logFile"');
	});
});
