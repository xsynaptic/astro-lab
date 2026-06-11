import { describe, expect, test } from 'vitest';

import { transformMarkdown } from '../markdown.js';

describe('transformMarkdown', () => {
	test('converts markdown to sanitized HTML with oldschool dashes by default', () => {
		expect(transformMarkdown({ input: '"Hello" -- world --- end' })).toBe(
			'<p>“Hello” – world — end</p>',
		);
	});

	test('allows callers to override smartypants options', () => {
		expect(
			transformMarkdown({ input: '"Hello" -- world', smartypantsOptions: { dashes: true } }),
		).toBe('<p>“Hello” — world</p>');
	});
});
