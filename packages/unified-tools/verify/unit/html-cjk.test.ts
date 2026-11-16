import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import { wrapChinese, wrapCjk } from '../../src/html-cjk.js';
import { stripTags } from '../../src/html.js';
import { htmlFragment } from './html-fragment.js';

describe('CJK wrapping', () => {
	test('wrapChinese tags Han runs with lang and leaves other text alone', () => {
		expect(wrapChinese('你好 world')).toBe('<span lang="zh">你好</span> world');
	});

	// wrapping runs after sanitize, so the default `class` survives while unsafe input is still stripped
	test('wrapCjk keeps the default cjk class and still sanitizes the input', () => {
		expect(wrapCjk({ input: 'Hello 中文 <script>alert(1)</script>', wrapCjkOptions: {} })).toBe(
			'Hello <span class="cjk">中文</span> ',
		);
	});
});

const wrapperOptions = fc.constantFrom(
	{},
	{ attribute: 'lang', value: 'zh' },
	{ attribute: 'data-cjk', value: 'yes' },
	{ element: 'cjk-wrap' },
	{ attribute: 'class', element: 'em', value: 'han' },
);

function wrapDefault(input: string) {
	return wrapCjk({ input, wrapCjkOptions: {} });
}

describe('wrapCjk properties', () => {
	test('keeps the text content', () => {
		let wrappedInputs = 0;

		fc.assert(
			fc.property(htmlFragment, (input) => {
				const wrapped = wrapDefault(input);

				if (wrapped.includes('<span class="cjk">')) wrappedInputs += 1;

				expect(stripTags(wrapped)).toBe(stripTags(input));
			}),
		);

		expect(wrappedInputs).toBeGreaterThan(0);
	});

	test('still strips any other class from a span', () => {
		expect(wrapDefault('<span class="note cjk">中</span>')).toBe('<span class="cjk">中</span>');
	});

	test.prop([htmlFragment, wrapperOptions])('is idempotent', (input, wrapCjkOptions) => {
		const once = wrapCjk({ input, wrapCjkOptions });

		expect(wrapCjk({ input: once, wrapCjkOptions })).toBe(once);
	});
});
