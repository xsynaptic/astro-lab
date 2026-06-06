import { describe, expect, test } from 'vitest';

import { sanitizeMdx } from '../mdx.js';

describe('sanitizeMdx', () => {
	test('strips MDX components from content', () => {
		expect(sanitizeMdx('Text with <Component prop="value" /> inside')).toBe('Text with inside');
	});
});
