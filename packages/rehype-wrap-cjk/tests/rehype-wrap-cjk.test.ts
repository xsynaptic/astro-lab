import type { VFileCompatible } from 'vfile';

import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { describe, expect, test } from 'vitest';

import { rehypeWrapCjk } from '../src/index.js';

const chineseProcessor = unified()
	.use(remarkParse)
	.use(remarkRehype)
	.use(rehypeWrapCjk, { attribute: 'lang', value: 'zh' })
	.use(rehypeStringify);

const japaneseProcessor = unified()
	.use(remarkParse)
	.use(remarkRehype)
	.use(rehypeWrapCjk, { attribute: 'lang', value: 'ja' })
	.use(rehypeStringify);

const koreanProcessor = unified()
	.use(remarkParse)
	.use(remarkRehype)
	.use(rehypeWrapCjk, { attribute: 'lang', value: 'ko' })
	.use(rehypeStringify);

const cjkProcessor = unified()
	.use(remarkParse)
	.use(remarkRehype)
	.use(rehypeWrapCjk, { attribute: 'class', value: 'cjk' })
	.use(rehypeStringify);

const processChinese = async (contents: VFileCompatible): Promise<VFileCompatible> =>
	chineseProcessor.process(contents).then(({ value }) => value);

const processJapanese = async (contents: VFileCompatible): Promise<VFileCompatible> =>
	japaneseProcessor.process(contents).then(({ value }) => value);

const processKorean = async (contents: VFileCompatible): Promise<VFileCompatible> =>
	koreanProcessor.process(contents).then(({ value }) => value);

const processCjk = async (contents: VFileCompatible): Promise<VFileCompatible> =>
	cjkProcessor.process(contents).then(({ value }) => value);

const chineseMarkdownText: Array<[string, string]> = [
	[
		'_Lorem ipsum_ dolor sit amet, consectetur adipiscing elit.',
		'<p><em>Lorem ipsum</em> dolor sit amet, consectetur adipiscing elit.</p>',
	],
	['林登玩即媽包候更穿光文去十！', '<p><span lang="zh">林登玩即媽包候更穿光文去十！</span></p>'],
	[
		'Sample text with CJK characters (中日韓字符) interspersed. 中文 can appear anywhere in the text.',
		'<p>Sample text with CJK characters (<span lang="zh">中日韓字符</span>) interspersed. <span lang="zh">中文</span> can appear anywhere in the text.</p>',
	],
	['你好', '<p><span lang="zh">你好</span></p>'],
	['Hello 世界', '<p>Hello <span lang="zh">世界</span></p>'],
	['一二三 ABC 四五六', '<p><span lang="zh">一二三</span> ABC <span lang="zh">四五六</span></p>'],
];

const japaneseMarkdownText: Array<[string, string]> = [
	['こんにちは世界', '<p><span lang="ja">こんにちは世界</span></p>'],
	['Hello こんにちは world', '<p>Hello <span lang="ja">こんにちは</span> world</p>'],
	[
		'ひらがな カタカナ 漢字',
		'<p><span lang="ja">ひらがな</span> <span lang="ja">カタカナ</span> <span lang="ja">漢字</span></p>',
	],
	[
		'English text with ひらがな mixed in',
		'<p>English text with <span lang="ja">ひらがな</span> mixed in</p>',
	],
	['アニメ', '<p><span lang="ja">アニメ</span></p>'],
	['日本語', '<p><span lang="ja">日本語</span></p>'],
	['ひらがな、カタカナ、漢字', '<p><span lang="ja">ひらがな、カタカナ、漢字</span></p>'],
];

const koreanMarkdownText: Array<[string, string]> = [
	['안녕하세요', '<p><span lang="ko">안녕하세요</span></p>'],
	['Hello 안녕 world', '<p>Hello <span lang="ko">안녕</span> world</p>'],
	[
		'한국어 문자열 테스트',
		'<p><span lang="ko">한국어</span> <span lang="ko">문자열</span> <span lang="ko">테스트</span></p>',
	],
	[
		'Mixed text with 한글 characters',
		'<p>Mixed text with <span lang="ko">한글</span> characters</p>',
	],
	['김치', '<p><span lang="ko">김치</span></p>'],
	[
		'한국어와 漢字 混合',
		'<p><span lang="ko">한국어와</span> <span lang="ko">漢字</span> <span lang="ko">混合</span></p>',
	],
];

const cjkMarkdownText: Array<[string, string]> = [
	[
		'Sample text with CJK characters (中日韓字符) interspersed. 中文 can appear anywhere in the text.',
		'<p>Sample text with CJK characters (<span class="cjk">中日韓字符</span>) interspersed. <span class="cjk">中文</span> can appear anywhere in the text.</p>',
	],
	['Hello こんにちは world', '<p>Hello <span class="cjk">こんにちは</span> world</p>'],
	['Hello 안녕 world', '<p>Hello <span class="cjk">안녕</span> world</p>'],
	[
		'Combined text sample with Chinese (中日韓字符), Japanese (こんにちは), and Korean (안녕).',
		'<p>Combined text sample with Chinese (<span class="cjk">中日韓字符</span>), Japanese (<span class="cjk">こんにちは</span>), and Korean (<span class="cjk">안녕</span>).</p>',
	],
];

describe('rehype wrap CJK plugin for Chinese characters', () => {
	for (const [input, output] of chineseMarkdownText) {
		test(`Chinese: ${String(input)}`, async () => {
			await expect(processChinese(input)).resolves.toEqual(output);
		});
	}
});

describe('rehype wrap CJK plugin for Japanese characters', () => {
	for (const [input, output] of japaneseMarkdownText) {
		test(`Japanese: ${String(input)}`, async () => {
			await expect(processJapanese(input)).resolves.toEqual(output);
		});
	}
});

describe('rehype wrap CJK plugin for Korean characters', () => {
	for (const [input, output] of koreanMarkdownText) {
		test(`Korean: ${String(input)}`, async () => {
			await expect(processKorean(input)).resolves.toEqual(output);
		});
	}
});

describe('rehype wrap CJK plugin for CJK characters', () => {
	for (const [input, output] of cjkMarkdownText) {
		test(`CJK: ${String(input)}`, async () => {
			await expect(processCjk(input)).resolves.toEqual(output);
		});
	}
});

const chineseHtmlProcessor = unified()
	.use(rehypeParse, { fragment: true })
	.use(rehypeWrapCjk, { attribute: 'lang', value: 'zh' })
	.use(rehypeStringify);

const processChineseHtml = async (contents: VFileCompatible): Promise<VFileCompatible> =>
	chineseHtmlProcessor.process(contents).then(({ value }) => value);

const chineseHtmlText: Array<[string, string]> = [
	// Ancestor check: text inside a nested element within a lang-tagged ancestor must not be re-wrapped
	['<span lang="zh">中文 <em>斜體</em> 外</span>', '<span lang="zh">中文 <em>斜體</em> 外</span>'],
	// Skip tags: CJK inside <code> must not be wrapped; CJK outside is wrapped
	[
		'外文 <code>內部</code> 外文',
		'<span lang="zh">外文</span> <code>內部</code> <span lang="zh">外文</span>',
	],
];

describe('rehype wrap CJK plugin for HTML inputs', () => {
	for (const [input, output] of chineseHtmlText) {
		test(`HTML: ${String(input)}`, async () => {
			await expect(processChineseHtml(input)).resolves.toEqual(output);
		});
	}
});

const processWith = async (
	options: NonNullable<Parameters<typeof rehypeWrapCjk>[0]>,
	input: string,
): Promise<VFileCompatible> =>
	unified()
		.use(remarkParse)
		.use(remarkRehype)
		.use(rehypeWrapCjk, options)
		.use(rehypeStringify)
		.process(input)
		.then(({ value }) => value);

describe('rehype wrap CJK plugin option configuration', () => {
	test('custom element, attribute, and value', async () => {
		await expect(
			processWith({ element: 'em', attribute: 'data-lang', value: 'zh-Hans' }, '你好'),
		).resolves.toEqual('<p><em data-lang="zh-Hans">你好</em></p>');
	});

	test('custom regex without g flag is normalized', async () => {
		await expect(
			processWith({ regex: /[你好]+/, attribute: 'lang', value: 'zh' }, '你好 世界'),
		).resolves.toEqual('<p><span lang="zh">你好</span> 世界</p>');
	});

	test('skipTags: [] disables default exclusions', async () => {
		await expect(
			processWith({ attribute: 'lang', value: 'zh', skipTags: [] }, '`中文`'),
		).resolves.toEqual('<p><code><span lang="zh">中文</span></code></p>');
	});

	test('fullwidth ASCII variants are wrapped', async () => {
		await expect(processWith({ attribute: 'lang', value: 'zh' }, 'Hello Ａ１')).resolves.toEqual(
			'<p>Hello <span lang="zh">Ａ１</span></p>',
		);
	});
});

const processHtmlWith = async (
	options: NonNullable<Parameters<typeof rehypeWrapCjk>[0]>,
	input: string,
): Promise<VFileCompatible> =>
	unified()
		.use(rehypeParse, { fragment: true })
		.use(rehypeWrapCjk, options)
		.use(rehypeStringify)
		.process(input)
		.then(({ value }) => value);

describe('rehype wrap CJK plugin skip behavior', () => {
	test('class attribute: wraps with class instead of lang', async () => {
		await expect(processWith({ attribute: 'class', value: 'cjk' }, 'Hello 中文')).resolves.toEqual(
			'<p>Hello <span class="cjk">中文</span></p>',
		);
	});

	test('class attribute: does not re-wrap own output', async () => {
		await expect(
			processHtmlWith({ attribute: 'class', value: 'cjk' }, '<span class="cjk">中文</span>'),
		).resolves.toEqual('<span class="cjk">中文</span>');
	});

	test('class attribute: does not skip on unrelated class', async () => {
		await expect(
			processHtmlWith({ attribute: 'class', value: 'cjk' }, '<span class="foo">中文</span>'),
		).resolves.toEqual('<span class="foo"><span class="cjk">中文</span></span>');
	});
});
