import { describe, expect, test } from 'vitest';

import { stylizeText } from '../text.js';

describe('stylizeText', () => {
	test('converts straight quotes to curly quotes', () => {
		expect(stylizeText('"Hello" -- world')).toBe('\u201CHello\u201D \u2014 world');
	});
});
