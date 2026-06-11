import { markdownToHtml, mdxToJs } from 'satteri';
import { describe, expect, test } from 'vitest';

import type { WrapCjkOptions } from '../src/index.js';

import { wrapCjk } from '../src/index.js';

// Component children are mdxJsx nodes at plugin time, so assert against compiled JS not HTML
async function compileMdx(source: string): Promise<string> {
	const result = await mdxToJs(source, {
		fileURL: new URL('file:///test.mdx'),
		hastPlugins: [wrapCjk()],
	});

	return result.code.replaceAll(/\s+/g, ' ');
}

async function render(source: string, options?: Readonly<WrapCjkOptions>): Promise<string> {
	const result = await markdownToHtml(source, { hastPlugins: [wrapCjk(options)] });

	return result.html.trim();
}

const chineseCases: Array<[string, string]> = [
	['你好', '<p><span lang="zh">你好</span></p>'],
	['Hello 世界', '<p>Hello <span lang="zh">世界</span></p>'],
	['一二三 ABC 四五六', '<p><span lang="zh">一二三</span> ABC <span lang="zh">四五六</span></p>'],
];

const japaneseCases: Array<[string, string]> = [
	['こんにちは世界', '<p><span lang="ja">こんにちは世界</span></p>'],
	['Hello こんにちは world', '<p>Hello <span lang="ja">こんにちは</span> world</p>'],
	['アニメ', '<p><span lang="ja">アニメ</span></p>'],
];

const koreanCases: Array<[string, string]> = [
	['안녕하세요', '<p><span lang="ko">안녕하세요</span></p>'],
	['Hello 안녕 world', '<p>Hello <span lang="ko">안녕</span> world</p>'],
	['김치', '<p><span lang="ko">김치</span></p>'],
];

describe('wrapCjk presets', () => {
	test.each(chineseCases)('zh: %s', async (input, expected) => {
		expect(await render(input, { attribute: 'lang', value: 'zh' })).toBe(expected);
	});

	test.each(japaneseCases)('ja: %s', async (input, expected) => {
		expect(await render(input, { attribute: 'lang', value: 'ja' })).toBe(expected);
	});

	test.each(koreanCases)('ko: %s', async (input, expected) => {
		expect(await render(input, { attribute: 'lang', value: 'ko' })).toBe(expected);
	});

	test('default cjk preset wraps all scripts with class="cjk"', async () => {
		const html = await render('Chinese 中文, Japanese こんにちは, Korean 안녕.');

		expect(html).toContain('<span class="cjk">中文</span>');
		expect(html).toContain('<span class="cjk">こんにちは</span>');
		expect(html).toContain('<span class="cjk">안녕</span>');
	});
});

describe('wrapCjk element coverage', () => {
	test('wraps inside a heading', async () => {
		expect(await render('# 標題 heading')).toContain('<span class="cjk">標題</span>');
	});

	test('wraps inside list items', async () => {
		const html = await render('- 項目一\n- 項目二');

		expect((html.match(/class="cjk"/g) ?? []).length).toBe(2);
	});

	test('wraps inside a link', async () => {
		const html = await render('[堤岸](https://example.com) is Cholon.');

		expect(html).toContain('<a href="https://example.com"><span class="cjk">堤岸</span></a>');
	});
});

describe('wrapCjk skips code', () => {
	test('does not wrap inside a fenced code block', async () => {
		const html = await render('```\n漢字 in code\n```');

		expect(html).not.toContain('class="cjk"');
	});

	test('does not wrap inside inline code', async () => {
		const html = await render('中文 and `程式碼` here.');

		expect((html.match(/class="cjk"/g) ?? []).length).toBe(1);
		expect(html).toContain('<code>程式碼</code>');
	});
});

describe('wrapCjk does not double-wrap', () => {
	test('produces no nested cjk spans', async () => {
		const html = await render('Mixed 中文 text 日本語 here.');

		expect(html).not.toMatch(/<span class="cjk">[^<]*<span/);
	});
});

describe('wrapCjk reaches MDX component children', () => {
	test('wraps CJK in a flow component caption', async () => {
		const code = await compileMdx('<Img>A caption with 中文 inside.</Img>\n');

		expect(code).toContain('className: "cjk", children: "中文"');
	});

	test('wraps CJK in an inline component', async () => {
		const code = await compileMdx('Visit <Link id="x">堤岸 today</Link> now.\n');

		expect(code).toContain('className: "cjk", children: "堤岸"');
	});

	test('does not wrap CJK inside code within a component', async () => {
		const code = await compileMdx('<Img>中文 `程式碼` caption.</Img>\n');

		expect(code).toContain('className: "cjk", children: "中文"');
		expect(code).not.toContain('className: "cjk", children: "程式碼"');
	});
});

describe('wrapCjk does not re-wrap already-wrapped content', () => {
	test('skips a component that already carries the marker', async () => {
		const code = await compileMdx('Already <span className="cjk">中文</span> wrapped.\n');

		expect((code.match(/className: "cjk"/g) ?? []).length).toBe(1);
	});

	test('still wraps CJK inside a component with an unrelated class', async () => {
		const code = await compileMdx('A <span className="highlight">中文</span> caption.\n');

		expect((code.match(/className: "cjk"/g) ?? []).length).toBe(1);
		expect(code).toContain('children: "中文"');
	});
});
