import { describe, expect, test } from 'vitest';

import { stylizeText } from '../src/text.js';

describe('stylizeText', () => {
	test('converts straight quotes to curly quotes and uses oldschool dashes by default', () => {
		expect(stylizeText('"Hello" -- world --- end')).toBe('“Hello” – world — end');
	});

	test('allows callers to override smartypants options', () => {
		expect(stylizeText('"Hello" -- world', { dashes: true })).toBe('“Hello” — world');
	});
});
