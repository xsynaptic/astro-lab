import { fc, test } from '@fast-check/vitest';
import rehypeParse from 'rehype-parse';
import { unified } from 'unified';
import { describe, expect } from 'vitest';

import { sanitizeHtml, stripTags } from '../../src/html.js';
import { htmlFragment } from './html-fragment.js';

const sampleText = [
	[`No change to plain text`, `No change to plain text`],
	[
		`This <a href="https://example.com">link</a> should be stripped`,
		`This link should be stripped`,
	],
	[
		`The following MDX component should not appear at all: <Img src="./test1.jpg" />`,
		`The following MDX component should not appear at all: `,
	],
] as const;

describe('html tags should be stripped', () => {
	for (const [input, output] of sampleText) {
		test(input, () => {
			expect(stripTags(input)).toEqual(output);
		});
	}
});

const fragmentParser = unified().use(rehypeParse, { fragment: true });

describe('sanitize properties', () => {
	test.prop([htmlFragment])('sanitizeHtml is idempotent', (input) => {
		const once = sanitizeHtml(input);

		expect(sanitizeHtml(once)).toBe(once);
	});

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
