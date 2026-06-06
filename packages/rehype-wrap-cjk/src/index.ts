import type { Element, Root, Text } from 'hast';
import type { Plugin, Transformer } from 'unified';

import { h } from 'hastscript';
import { visitParents } from 'unist-util-visit-parents';

export interface RehypeWrapCjkOptions {
	element?: string;
	attribute?: string;
	value?: string;
	regex?: RegExp;
	skipTags?: Array<string>;
}

const defaultSkipTags = ['code', 'pre', 'kbd', 'samp', 'script', 'style'];

function isAncestorWrapped(ancestor: Element, attribute: string, value: string): boolean {
	if (attribute === 'class' || attribute === 'className') {
		const classes = ancestor.properties.className;

		if (Array.isArray(classes)) return classes.includes(value);

		if (typeof classes === 'string') return classes.split(/\s+/).includes(value);

		return false;
	}
	return ancestor.properties[attribute] === value;
}

/**
 * Script-based ranges using Unicode Script Extensions property
 * Authoritative and auto-updates with the JS engine's Unicode version
 */
export const zhScriptRange = String.raw`\p{scx=Han}\p{scx=Bopomofo}`;
export const jaScriptRange = String.raw`\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}`;
export const koScriptRange = String.raw`\p{scx=Hangul}\p{scx=Han}`;
export const cjkScriptRange = String.raw`\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}`;

/**
 * Full-width ASCII variants (FF01-FF5E): digits,letters, punctuation
 * Not covered by script extensions but sometimes used in CJK contexts
 */
export const fullwidthAsciiRange = String.raw`\uFF01-\uFF5E`;

export const cjkRegexPresets = {
	zh: new RegExp(`[${zhScriptRange}${fullwidthAsciiRange}]+`, 'gu'),
	ja: new RegExp(`[${jaScriptRange}${fullwidthAsciiRange}]+`, 'gu'),
	ko: new RegExp(`[${koScriptRange}${fullwidthAsciiRange}]+`, 'gu'),
	cjk: new RegExp(`[${cjkScriptRange}${fullwidthAsciiRange}]+`, 'gu'),
};

export const rehypeWrapCjk: Plugin<[RehypeWrapCjkOptions?], Root> = (options) => {
	const settings = {
		element: options?.element ?? 'span',
		attribute: options?.attribute ?? 'class',
		value: options?.value ?? 'cjk',
		regex: options?.regex,
		skipTags: options?.skipTags ?? defaultSkipTags,
	};

	const baseRegex =
		settings.regex ??
		(settings.value in cjkRegexPresets
			? cjkRegexPresets[settings.value as keyof typeof cjkRegexPresets]
			: cjkRegexPresets.cjk);

	// always clone so a caller-supplied global regex never carries its lastIndex into matchAll
	const flags = baseRegex.flags.includes('g') ? baseRegex.flags : baseRegex.flags + 'g';
	const regex = new RegExp(baseRegex.source, flags);

	function transformer(tree: Root) {
		visitParents(tree, 'text', function visitor(node, ancestors) {
			const parent = ancestors.at(-1);
			if (!parent || !('children' in parent) || typeof node.value !== 'string') return;

			// Skip text inside excluded tags (code, pre, script, etc.)
			if (
				ancestors.some(
					(ancestor) => ancestor.type === 'element' && settings.skipTags.includes(ancestor.tagName),
				)
			)
				return;

			// Skip if any ancestor is already wrapped
			if (
				ancestors.some(
					(ancestor) =>
						ancestor.type === 'element' &&
						isAncestorWrapped(ancestor, settings.attribute, settings.value),
				)
			)
				return;

			const index = parent.children.indexOf(node);
			if (index === -1) return;

			const parts: Array<Element | Text> = [];
			let lastIndex = 0;

			for (const match of node.value.matchAll(regex)) {
				const matchIndex = match.index;

				if (matchIndex > lastIndex) {
					parts.push({
						type: 'text',
						value: node.value.slice(lastIndex, matchIndex),
					});
				}
				parts.push(h(settings.element, { [settings.attribute]: settings.value }, [match[0]]));
				lastIndex = matchIndex + match[0].length;
			}

			if (lastIndex < node.value.length) {
				parts.push({ type: 'text', value: node.value.slice(lastIndex) });
			}

			parent.children.splice(index, 1, ...parts);
		});

		return tree;
	}

	return transformer satisfies Transformer<Root>;
};
