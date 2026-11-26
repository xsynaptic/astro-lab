import { fc, test } from '@fast-check/vitest';
import rehypeParse from 'rehype-parse';
import { unified } from 'unified';
import { describe, expect } from 'vitest';

import { stripTags } from '../../src/html.js';
import { htmlFragment } from './html-fragment.js';

describe('stripTags', () => {
	test('strips a tag and keeps its text', () => {
		expect(stripTags('This <a href="https://example.com">link</a> should be stripped')).toBe(
			'This link should be stripped',
		);
	});
});

const fragmentParser = unified().use(rehypeParse, { fragment: true });

describe('sanitize properties', () => {
	test.prop([htmlFragment])('stripTags is idempotent', (input) => {
		const once = stripTags(input);

		expect(stripTags(once)).toBe(once);
	});

	test('stripTags output parses back to text alone', () => {
		let markupInputs = 0;

		fc.assert(
			fc.property(htmlFragment, (input) => {
				if (input.includes('<')) markupInputs += 1;

				const nodeTypes = fragmentParser.parse(stripTags(input)).children.map((node) => node.type);

				expect(nodeTypes.filter((type) => type !== 'text')).toEqual([]);
			}),
		);

		expect(markupInputs).toBeGreaterThan(0);
	});
});
