import { describe, expect, test } from 'vitest';

import { transformMarkdown } from '../markdown.js';

describe('transformMarkdown', () => {
	test('converts markdown to sanitized HTML with smartypants', () => {
		expect(transformMarkdown({ input: '"Hello" -- world' })).toBe(
			'<p>\u201CHello\u201D \u2014 world</p>',
		);
	});
});
