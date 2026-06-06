import { describe, expect, test } from 'vitest';

import { wrapChinese, wrapCjk } from '../html-cjk.js';

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
