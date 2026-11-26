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

import { rehypeWrapCjk } from '../../src/index.js';

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

const markdownCases = [
	{
		attribute: 'lang',
		expected: '<p><span lang="zh">一二三</span> ABC <span lang="zh">四五六</span></p>',
		input: '一二三 ABC 四五六',
		value: 'zh',
	},
	{
		attribute: 'lang',
		expected: '<p><span lang="ja">ひらがな、カタカナ、漢字</span></p>',
		input: 'ひらがな、カタカナ、漢字',
		value: 'ja',
	},
	{
		attribute: 'lang',
		expected:
			'<p><span lang="ko">한국어와</span> <span lang="ko">漢字</span> <span lang="ko">混合</span></p>',
		input: '한국어와 漢字 混合',
		value: 'ko',
	},
	{
		attribute: 'class',
		expected:
			'<p>Combined text sample with Chinese (<span class="cjk">中日韓字符</span>), Japanese (<span class="cjk">こんにちは</span>), and Korean (<span class="cjk">안녕</span>).</p>',
		input:
			'Combined text sample with Chinese (中日韓字符), Japanese (こんにちは), and Korean (안녕).',
		value: 'cjk',
	},
];

describe('rehype wrap CJK plugin for markdown', () => {
	test.each(markdownCases)('$value: $input', async ({ attribute, expected, input, value }) => {
		await expect(processWith({ attribute, value }, input)).resolves.toEqual(expected);
	});
});

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
	test('data attribute: does not re-wrap own output', async () => {
		await expect(
			processHtmlWith({ attribute: 'data-cjk', value: 'yes' }, '<span data-cjk="yes">中文</span>'),
		).resolves.toEqual('<span data-cjk="yes">中文</span>');
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

	test.prop([
		htmlFragment,
		fc.constantFrom(
			{},
			{ attribute: 'lang', value: 'zh' },
			{ attribute: 'data-cjk', value: 'yes' },
			{ attribute: 'class', element: 'em', value: 'han' },
		),
	])('is idempotent for any wrapper', (input, options) => {
		const processor = unified()
			.use(rehypeParse, { fragment: true })
			.use(rehypeWrapCjk, options)
			.use(rehypeStringify);
		const once = String(processor.processSync(input));

		expect(String(processor.processSync(once))).toBe(once);
	});
});
