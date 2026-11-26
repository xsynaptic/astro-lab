import type { Element, Root, RootContent } from 'hast';

import { fc, test } from '@fast-check/vitest';
import { htmlToHast, markdownToHtml, mdxToJs } from 'satteri';
import { describe, expect } from 'vitest';

import type { WrapCjkOptions } from '../../src/index.js';

import { wrapCjk } from '../../src/index.js';

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
	['一二三 ABC 四五六', '<p><span lang="zh">一二三</span> ABC <span lang="zh">四五六</span></p>'],
];

const japaneseCases: Array<[string, string]> = [
	['こんにちは世界', '<p><span lang="ja">こんにちは世界</span></p>'],
	['アニメ', '<p><span lang="ja">アニメ</span></p>'],
];

const koreanCases: Array<[string, string]> = [
	['안녕하세요', '<p><span lang="ko">안녕하세요</span></p>'],
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

describe('wrapCjk skips code', () => {
	test('does not wrap inside a fenced code block', async () => {
		const html = await render('```\n漢字 in code\n```');

		expect(html).not.toContain('class="cjk"');
	});
});

describe('wrapCjk with inline raw HTML', () => {
	test('reads the marker through attribute quoting and casing', async () => {
		const html = await render('A <SPAN CLASS="one cjk two">中文字</SPAN> B');

		expect(html).not.toContain('<span class="cjk">');
	});

	test('treats an HTML comment as a comment, not an open tag', async () => {
		const html = await render('x <!-- <code> --> 中文 y');

		expect(html).toContain('<span class="cjk">中文</span>');
	});

	test('keeps wrapping after a void tag', async () => {
		const html = await render('A <br> 中文 B');

		expect(html).toContain('<span class="cjk">中文</span>');
	});

	test('shields inside a raw tag carrying a > in an attribute value', async () => {
		const html = await render('A <code title="a>b">中文字</code> B');

		expect(html).not.toContain('class="cjk"');
	});

	// Sätteri applies mutations after the pass, so an expanding sibling must not shift the indexes
	test('keeps shields aligned after earlier siblings expand', async () => {
		const html = await render('一 二 <code>三</code> 四 <code>五</code> 六');

		expect(html).toBe(
			'<p><span class="cjk">一</span> <span class="cjk">二</span> <code>三</code> <span class="cjk">四</span> <code>五</code> <span class="cjk">六</span></p>',
		);
	});
});

describe('wrapCjk reaches MDX component children', () => {
	test('wraps CJK in flow and inline component children', async () => {
		const flow = await compileMdx('<Img>A caption with 中文 inside.</Img>\n');
		const inline = await compileMdx('Visit <Link id="x">堤岸 today</Link> now.\n');

		expect(flow).toContain('className: "cjk", children: "中文"');
		expect(inline).toContain('className: "cjk", children: "堤岸"');
	});
});

describe('wrapCjk does not re-wrap already-wrapped content', () => {
	test('skips a component that already carries the marker', async () => {
		const code = await compileMdx('Already <span className="cjk">中文</span> wrapped.\n');

		expect((code.match(/className: "cjk"/g) ?? []).length).toBe(1);
	});

	// Pins the multi-level ctx.parent() climb: the marker is a grandparent, not the direct parent
	test('skips CJK nested below an already-wrapped ancestor', async () => {
		const code = await compileMdx('<span className="cjk">A <strong>中文</strong> B</span>\n');

		expect((code.match(/className: "cjk"/g) ?? []).length).toBe(1);
	});

	test('still wraps CJK inside a component with an unrelated class', async () => {
		const code = await compileMdx('A <span className="highlight">中文</span> caption.\n');

		expect((code.match(/className: "cjk"/g) ?? []).length).toBe(1);
		expect(code).toContain('children: "中文"');
	});
});

const cjkPattern =
	/[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}\u{FF01}-\u{FF5E}]/u;
const shieldTags = new Set(['code', 'kbd', 'pre', 'samp']);
const wrapper = { attribute: 'class', element: 'cjk-wrap', value: 'cjk' } as const;

function closingTag(openingTag: string) {
	return `</${openingTag.split(' ', 1)[0] ?? openingTag}>`;
}

const textRun = fc.string({
	maxLength: 5,
	minLength: 1,
	unit: fc.constantFrom('中', '文', 'か', 'カ', '한', 'ㄅ', '！', 'a', 'B', ' ', '1', ','),
});

const { markdownInline } = fc.letrec<{ element: string; markdownInline: string; node: string }>(
	(tie) => ({
		element: fc.oneof(
			fc
				.tuple(
					fc.constantFrom('em', 'code', 'kbd', 'strong', 'span class="cjk"', 'span class="note"'),
					tie('markdownInline'),
				)
				.map(([tag, content]) => `<${tag}>${content}${closingTag(tag)}`),
			textRun.map((code) => `\`${code}\``),
		),
		markdownInline: fc.array(tie('node'), { maxLength: 4 }).map((nodes) => nodes.join('')),
		node: fc.oneof({ depthSize: 'small' }, textRun, tie('element')),
	}),
);

const sameNameNesting = fc
	.tuple(
		fc.constantFrom(
			['code', 'code'],
			['span class="cjk"', 'span class="note"'],
			['span class="cjk"', 'span class="cjk"'],
		),
		textRun,
		textRun,
	)
	.map(([[outer, inner], innerText, afterInner]) => {
		return `<${outer}><${inner}>${innerText}${closingTag(inner)}${afterInner}${closingTag(outer)}`;
	});

async function renderInline(source: string, isWrapping: boolean) {
	const result = await markdownToHtml(source, {
		hastPlugins: isWrapping ? [wrapCjk(wrapper)] : [],
	});

	return result.html;
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
	const misplaced: Array<string> = [];

	function walk(node: Root | RootContent, isShielded: boolean) {
		if (!isShielded && node.type === 'text' && cjkPattern.test(node.value)) {
			misplaced.push(`left unwrapped: ${node.value}`);
		}

		if (isShielded && node.type === 'element' && node.tagName === wrapper.element) {
			misplaced.push(`wrapped inside a shield: ${html}`);
		}

		if (!('children' in node)) return;

		const isChildShielded = isShielded || (node.type === 'element' && isShield(node));

		for (const child of node.children) walk(child, isChildShielded);
	}

	walk(htmlToHast(html, { fragment: true }) as Root, false);

	return misplaced;
}

describe('wrapCjk properties', () => {
	test.prop([markdownInline])(
		'only adds wrapper elements, leaving everything else as it was',
		async (source) => {
			const wrapped = await renderInline(source, true);

			expect(wrapped.replaceAll(/<\/?cjk-wrap[^>]*>/g, '')).toBe(await renderInline(source, false));
		},
	);

	test.prop([markdownInline])(
		'wraps CJK exactly where no code or hand-written wrapper shields it',
		async (source) => {
			expect(findMisplacedWrapping(await renderInline(source, true))).toEqual([]);
		},
	);

	test.prop([sameNameNesting])(
		'keeps shielding after an inner tag of the same name closes',
		async (source) => {
			expect(findMisplacedWrapping(await renderInline(source, true))).toEqual([]);
		},
	);

	test.prop([markdownInline])(
		'wraps each run whole, never splitting it across wrappers',
		async (source) => {
			const splitRun = new RegExp(
				`</cjk-wrap>(?:<cjk-wrap|${cjkPattern.source})|${cjkPattern.source}<cjk-wrap`,
				'u',
			);

			expect(await renderInline(source, true)).not.toMatch(splitRun);
		},
	);
});
