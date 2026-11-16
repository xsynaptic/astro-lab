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

	test.fails('is idempotent on a wrapped run', () => {
		expect(wrapDefault(wrapDefault('中'))).toBe('<span class="cjk">中</span>');
	});

	test.fails.prop([htmlFragment])('is idempotent', (input) => {
		const once = wrapDefault(input);

		expect(wrapDefault(once)).toBe(once);
	});
});
