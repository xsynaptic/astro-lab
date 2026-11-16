import { fc } from '@fast-check/vitest';

const cjkRun = fc.string({
	maxLength: 4,
	minLength: 1,
	unit: fc.constantFrom('中', '文', 'か', 'カ', '한', 'ㄅ', '！'),
});

const latinRun = fc.string({
	maxLength: 4,
	minLength: 1,
	unit: fc.constantFrom('a', 'B', '1', ' ', ',', '\n', '&', 'amp;', 'lt;', '#x26;'),
});

const markupToken = fc.constantFrom(
	'<em>',
	'</em>',
	'<code>',
	'</code>',
	'<span class="cjk">',
	'<span class="note">',
	'</span>',
	'<a href="https://example.com">',
	'<a href="javascript:alert(1)">',
	'</a>',
	'<script>',
	'</script>',
	'<img src="x.jpg" onerror="alert(1)">',
	'<Img src="./a.jpg" />',
	'<!-- note -->',
	'<br>',
	'&amp;',
	'&lt;',
	'&quot;',
	'<',
	'>',
	'&',
	'"',
);

export const htmlFragment = fc
	.array(fc.oneof(cjkRun, latinRun, markupToken), { maxLength: 12 })
	.map((tokens) => tokens.join(''));
