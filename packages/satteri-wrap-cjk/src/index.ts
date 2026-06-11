import type { Element, ElementContent, Text } from 'hast';
import type { HastPluginInput, HastVisitorContext, MdxJsxAttributeUnion } from 'satteri';

import { h } from 'hastscript';
import { defineHastPlugin } from 'satteri';
import { z } from 'zod';

const optionsSchema = z.object({
	attribute: z.string().default('class'),
	element: z.string().default('span'),
	regex: z.instanceof(RegExp).optional(),
	value: z.string().default('cjk'),
});

type WrapCjkOptions = z.input<typeof optionsSchema>;

// Script ranges from the Unicode Script Extensions property
// They track the JS engine's Unicode version
const zhScriptRange = String.raw`\p{scx=Han}\p{scx=Bopomofo}`;
const jaScriptRange = String.raw`\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}`;
const koScriptRange = String.raw`\p{scx=Hangul}\p{scx=Han}`;
const cjkScriptRange = String.raw`\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}`;

// Full-width ASCII variants (U+FF01-U+FF5E), common in CJK text but outside the script ranges
const fullwidthAsciiRange = String.raw`！-～`;

const cjkRegexPresets = {
	cjk: new RegExp(`[${cjkScriptRange}${fullwidthAsciiRange}]+`, 'gu'),
	ja: new RegExp(`[${jaScriptRange}${fullwidthAsciiRange}]+`, 'gu'),
	ko: new RegExp(`[${koScriptRange}${fullwidthAsciiRange}]+`, 'gu'),
	zh: new RegExp(`[${zhScriptRange}${fullwidthAsciiRange}]+`, 'gu'),
};

function presetFor(value: string): RegExp | undefined {
	if (value === 'cjk') return cjkRegexPresets.cjk;
	if (value === 'ja') return cjkRegexPresets.ja;
	if (value === 'ko') return cjkRegexPresets.ko;
	if (value === 'zh') return cjkRegexPresets.zh;
	return undefined;
}

// Sätteri's hast visitor has no ancestor context, so we visit an allowlist of text-bearing elements
// Each visit wraps the element's direct text children; code-like tags are off the list so they are never reached
// Elements already carrying the marker are skipped (see isWrapper), so existing wrappers are never doubled
const textBearingTags = [
	'p',
	'li',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'blockquote',
	'td',
	'th',
	'dd',
	'dt',
	'figcaption',
	'caption',
	'summary',
	'span',
	'a',
	'em',
	'strong',
	'b',
	'i',
	'mark',
	'sup',
	'sub',
	'small',
	'abbr',
	'cite',
	'q',
	'del',
	'ins',
	'time',
];

export function wrapCjk(options?: null | Readonly<WrapCjkOptions>): HastPluginInput {
	const settings = optionsSchema.parse(options ?? {});
	const targetsClass = settings.attribute === 'class' || settings.attribute === 'className';

	const baseRegex = settings.regex ?? presetFor(settings.value) ?? cjkRegexPresets.cjk;

	// Clone so a caller-supplied global regex never carries its lastIndex into matchAll
	const flags = baseRegex.flags.includes('g') ? baseRegex.flags : baseRegex.flags + 'g';
	const regex = new RegExp(baseRegex.source, flags);

	// A class list reaches us as an array or a space-separated string
	function classListHasMarker(value: unknown): boolean {
		if (Array.isArray(value)) return value.includes(settings.value);
		if (typeof value === 'string') return value.split(/\s+/).includes(settings.value);
		return false;
	}

	// An element already carrying the marker is a wrapper (ours or the author's); skip it
	function elementIsWrapper(node: Element): boolean {
		if (targetsClass) return classListHasMarker(node.properties.className);
		return node.properties[settings.attribute] === settings.value;
	}

	// Same check for an MDX component, whose attributes are mdxJsx nodes rather than hast properties
	function componentIsWrapper(node: {
		readonly attributes: ReadonlyArray<MdxJsxAttributeUnion>;
	}): boolean {
		for (const attribute of node.attributes) {
			if (attribute.type !== 'mdxJsxAttribute' || typeof attribute.value !== 'string') continue;
			if (targetsClass) {
				if (
					(attribute.name === 'class' || attribute.name === 'className') &&
					attribute.value.split(/\s+/).includes(settings.value)
				) {
					return true;
				}
			} else if (attribute.name === settings.attribute && attribute.value === settings.value) {
				return true;
			}
		}
		return false;
	}

	function wrapTextChildren(
		node: { readonly children: ReadonlyArray<ElementContent> },
		ctx: HastVisitorContext,
	): void {
		for (const child of node.children) {
			if (child.type !== 'text' || typeof child.value !== 'string') continue;

			const matches = [...child.value.matchAll(regex)];
			if (matches.length === 0) continue;

			const parts: Array<Element | Text> = [];
			let lastIndex = 0;

			for (const match of matches) {
				const matchIndex = match.index;

				if (matchIndex > lastIndex) {
					parts.push({ type: 'text', value: child.value.slice(lastIndex, matchIndex) });
				}
				parts.push(h(settings.element, { [settings.attribute]: settings.value }, match[0]));
				lastIndex = matchIndex + match[0].length;
			}

			if (lastIndex < child.value.length) {
				parts.push({ type: 'text', value: child.value.slice(lastIndex) });
			}

			// eslint-disable-next-line unicorn/prefer-modern-dom-apis -- ctx.insertBefore is satteri's hast visitor API, not the DOM node method
			ctx.insertBefore(child, parts);
			ctx.removeNode(child);
		}
	}

	// An empty filter matches every MDX component, whose children are still mdxJsx nodes at plugin time
	// This reaches CJK in component children such as an <Img> caption
	return defineHastPlugin({
		element: {
			filter: textBearingTags,
			visit: (node, ctx) => {
				if (!elementIsWrapper(node)) wrapTextChildren(node, ctx);
			},
		},
		mdxJsxFlowElement: {
			filter: [],
			visit: (node, ctx) => {
				if (!componentIsWrapper(node)) wrapTextChildren(node, ctx);
			},
		},
		mdxJsxTextElement: {
			filter: [],
			visit: (node, ctx) => {
				if (!componentIsWrapper(node)) wrapTextChildren(node, ctx);
			},
		},
		name: 'wrap-cjk',
	});
}

export type { WrapCjkOptions };
