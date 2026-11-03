import type { Element, Root } from 'hast';
import type { VFileCompatible } from 'vfile';

import { fc, test } from '@fast-check/vitest';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visitParents } from 'unist-util-visit-parents';
import { describe, expect } from 'vitest';

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

const processChinese = async (contents: VFileCompatible): Promise<VFileCompatible> => {
	const { value } = await chineseProcessor.process(contents);
	return value;
};

const processJapanese = async (contents: VFileCompatible): Promise<VFileCompatible> => {
	const { value } = await japaneseProcessor.process(contents);
	return value;
};

const processKorean = async (contents: VFileCompatible): Promise<VFileCompatible> => {
	const { value } = await koreanProcessor.process(contents);
	return value;
};

const processCjk = async (contents: VFileCompatible): Promise<VFileCompatible> => {
	const { value } = await cjkProcessor.process(contents);
	return value;
};

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
	['一二三 ABC 四五六', '<p><span lang="zh">一二三</span> ABC <span lang="zh">四五六</span></p>'],
];

const japaneseMarkdownText: Array<[string, string]> = [
	['こんにちは世界', '<p><span lang="ja">こんにちは世界</span></p>'],
	['Hello こんにちは world', '<p>Hello <span lang="ja">こんにちは</span> world</p>'],
	[
		'ひらがな カタカナ 漢字',
		'<p><span lang="ja">ひらがな</span> <span lang="ja">カタカナ</span> <span lang="ja">漢字</span></p>',
	],
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
		'한국어와 漢字 混合',
		'<p><span lang="ko">한국어와</span> <span lang="ko">漢字</span> <span lang="ko">混合</span></p>',
	],
];

const cjkMarkdownText: Array<[string, string]> = [
	[
		'Sample text with CJK characters (中日韓字符) interspersed. 中文 can appear anywhere in the text.',
		'<p>Sample text with CJK characters (<span class="cjk">中日韓字符</span>) interspersed. <span class="cjk">中文</span> can appear anywhere in the text.</p>',
	],
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

const processChineseHtml = async (contents: VFileCompatible): Promise<VFileCompatible> => {
	const { value } = await chineseHtmlProcessor.process(contents);
	return value;
};

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
): Promise<VFileCompatible> => {
	const { value } = await unified()
		.use(remarkParse)
		.use(remarkRehype)
		.use(rehypeWrapCjk, options)
		.use(rehypeStringify)
		.process(input);
	return value;
};

describe('rehype wrap CJK plugin option configuration', () => {
	test('custom element, attribute, and value', async () => {
		await expect(
			processWith({ attribute: 'data-lang', element: 'em', value: 'zh-Hans' }, '你好'),
		).resolves.toEqual('<p><em data-lang="zh-Hans">你好</em></p>');
	});

	test('custom regex without g flag is normalized', async () => {
		await expect(
			processWith({ attribute: 'lang', regex: /[你好]+/, value: 'zh' }, '你好 世界'),
		).resolves.toEqual('<p><span lang="zh">你好</span> 世界</p>');
	});

	test('skipTags: [] disables default exclusions', async () => {
		await expect(
			processWith({ attribute: 'lang', skipTags: [], value: 'zh' }, '`中文`'),
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
): Promise<VFileCompatible> => {
	const { value } = await unified()
		.use(rehypeParse, { fragment: true })
		.use(rehypeWrapCjk, options)
		.use(rehypeStringify)
		.process(input);
	return value;
};

describe('rehype wrap CJK plugin skip behavior', () => {
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

const cjkPattern =
	/[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}\u{FF01}-\u{FF5E}]/u;
const shieldTags = new Set(['code', 'kbd', 'pre', 'samp']);

function closingTag(openingTag: string) {
	return `</${openingTag.split(' ', 1)[0] ?? openingTag}>`;
}

const textRun = fc.string({
	maxLength: 5,
	minLength: 1,
	unit: fc.constantFrom('中', '文', 'か', 'カ', '한', 'ㄅ', '！', 'a', 'B', ' ', '1', ','),
});

const { htmlFragment } = fc.letrec<{ element: string; htmlFragment: string; node: string }>(
	(tie) => ({
		element: fc
			.tuple(
				fc.constantFrom('em', 'code', 'kbd', 'strong', 'span class="cjk"', 'span class="note"'),
				tie('htmlFragment'),
			)
			.map(([tag, content]) => `<${tag}>${content}${closingTag(tag)}`),
		htmlFragment: fc.array(tie('node'), { maxLength: 4 }).map((nodes) => nodes.join('')),
		node: fc.oneof({ depthSize: 'small' }, textRun, tie('element')),
	}),
);

const wrapper = { attribute: 'class', element: 'cjk-wrap', value: 'cjk' } as const;

function processFragment(input: string, isWrapping: boolean) {
	const processor = unified().use(rehypeParse, { fragment: true });

	if (isWrapping) processor.use(rehypeWrapCjk, wrapper);

	return String(processor.use(rehypeStringify).processSync(input));
}

function isShield(node: Element) {
	const className = node.properties.className;

	return (
		shieldTags.has(node.tagName) ||
		node.tagName === wrapper.element ||
		(Array.isArray(className) && className.includes(wrapper.value))
	);
}

function findMisplacedWrapping(html: string) {
	const tree = unified().use(rehypeParse, { fragment: true }).parse(html) satisfies Root;
	const misplaced: Array<string> = [];

	visitParents(tree, (node, ancestors) => {
		const isShielded = ancestors.some(
			(ancestor) => ancestor.type === 'element' && isShield(ancestor),
		);

		if (isShielded && node.type === 'element' && node.tagName === wrapper.element) {
			misplaced.push(`wrapped inside a shield: ${html}`);
		}

		if (!isShielded && node.type === 'text' && cjkPattern.test(node.value)) {
			misplaced.push(`left unwrapped: ${node.value}`);
		}
	});

	return misplaced;
}

describe('rehype wrap CJK properties', () => {
	test.prop([htmlFragment])(
		'only adds wrapper elements, leaving everything else as it was',
		(input) => {
			const wrapped = processFragment(input, true);

			expect(wrapped.replaceAll(/<\/?cjk-wrap[^>]*>/g, '')).toBe(processFragment(input, false));
		},
	);

	test.prop([htmlFragment])(
		'wraps CJK exactly where no code or existing wrapper shields it',
		(input) => {
			expect(findMisplacedWrapping(processFragment(input, true))).toEqual([]);
		},
	);

	test.prop([htmlFragment])('wraps each run whole, never splitting it across wrappers', (input) => {
		const wrapped = processFragment(input, true);

		const splitRun = new RegExp(
			`</cjk-wrap>(?:<cjk-wrap|${cjkPattern.source})|${cjkPattern.source}<cjk-wrap`,
			'u',
		);

		expect(wrapped).not.toMatch(splitRun);
	});
});
