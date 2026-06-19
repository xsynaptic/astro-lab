import type { Element, Root, Text } from 'hast';
import type { HastVisitorContext, MdxJsxFlowElementHast, MdxJsxTextElementHast } from 'satteri';

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
const fullwidthAsciiRange = '！-～';

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

// Code-like elements whose CJK must stay verbatim
const skipTags = new Set(['code', 'kbd', 'pre', 'samp', 'script', 'style']);

// Lowercase MDX elements stay as mdxJsx nodes at hast time, so an author's <span class="cjk"> is one of these
type Ancestor = Readonly<Element | MdxJsxFlowElementHast | MdxJsxTextElementHast | Root>;

export function wrapCjk(options?: null | Readonly<WrapCjkOptions>) {
	const settings = optionsSchema.parse(options ?? {});
	const isTargetsClass = settings.attribute === 'class' || settings.attribute === 'className';

	const baseRegex = settings.regex ?? presetFor(settings.value) ?? cjkRegexPresets.cjk;

	// Clone so a caller-supplied global regex never carries its lastIndex into matchAll
	const flags = baseRegex.flags.includes('g') ? baseRegex.flags : baseRegex.flags + 'g';
	const regex = new RegExp(baseRegex.source, flags);

	// A class list reaches us as an array or a space-separated string
	function hasMarkerInClassList(value: unknown): boolean {
		if (Array.isArray(value)) return value.includes(settings.value);
		if (typeof value === 'string') return value.split(/\s+/).includes(settings.value);
		return false;
	}

	// An element already carrying the marker is a wrapper (ours or the author's)
	function isElementWrapper(node: Readonly<Element>): boolean {
		if (isTargetsClass) return hasMarkerInClassList(node.properties.className);
		return node.properties[settings.attribute] === settings.value;
	}

	// Same check for an MDX element, whose attributes are mdxJsx nodes rather than hast properties
	function isComponentWrapper(
		node: Readonly<MdxJsxFlowElementHast | MdxJsxTextElementHast>,
	): boolean {
		for (const attribute of node.attributes) {
			if (attribute.type !== 'mdxJsxAttribute' || typeof attribute.value !== 'string') continue;
			if (isTargetsClass) {
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

	// ctx.parent climbs to the root, letting us shield text under code or an existing wrapper
	function isShielded(node: Readonly<Text>, ctx: HastVisitorContext): boolean {
		let ancestor: Ancestor | undefined = ctx.parent(node);
		while (ancestor) {
			if (ancestor.type === 'element') {
				if (skipTags.has(ancestor.tagName) || isElementWrapper(ancestor)) return true;
			} else if (ancestor.type !== 'root' && isComponentWrapper(ancestor)) {
				return true;
			}
			ancestor = ctx.parent(ancestor);
		}
		return false;
	}

	return defineHastPlugin({
		name: 'wrap-cjk',
		text: (node, ctx) => {
			if (isShielded(node, ctx)) return;

			const matches = [...node.value.matchAll(regex)];
			if (matches.length === 0) return;

			const parts: Array<Element | Text> = [];
			let lastIndex = 0;

			for (const match of matches) {
				const matchIndex = match.index;

				if (matchIndex > lastIndex) {
					parts.push({ type: 'text', value: node.value.slice(lastIndex, matchIndex) });
				}
				parts.push(h(settings.element, { [settings.attribute]: settings.value }, match[0]));
				lastIndex = matchIndex + match[0].length;
			}

			if (lastIndex < node.value.length) {
				parts.push({ type: 'text', value: node.value.slice(lastIndex) });
			}

			// eslint-disable-next-line unicorn/prefer-modern-dom-apis -- ctx.insertBefore is Sätteri's hast visitor API, not the DOM node method
			ctx.insertBefore(node, parts);
			ctx.removeNode(node);
		},
	});
}

export type { WrapCjkOptions };
