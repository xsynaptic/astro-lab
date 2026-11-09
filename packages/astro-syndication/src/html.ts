import type { Element } from 'hast';
import type { Schema } from 'hast-util-sanitize';

import { fromHtml } from 'hast-util-from-html';
import { defaultSchema, sanitize } from 'hast-util-sanitize';
import { toHtml } from 'hast-util-to-html';
import { visit } from 'unist-util-visit';

import { resolveUrl } from './url.js';

// Not `satisfies Schema`: the inferred type names an unexported hast-util-sanitize type
interface SyndicationSchema extends Schema {
	clobber: Array<string>;
	protocols: NonNullable<Schema['protocols']>;
	tagNames: Array<string>;
}

export const syndicationSchema: SyndicationSchema = {
	...defaultSchema,
	clobber: [],
	protocols: {
		...defaultSchema.protocols,
		href: [...(defaultSchema.protocols?.href ?? []), 'tel'],
	},
	tagNames: [...(defaultSchema.tagNames ?? []), 'figcaption', 'figure'],
};

const urlProperties = ['href', 'poster', 'src'] as const;

// Not a split on commas, which would break data URLs
const srcSetUrl = /(^|,)(\s*)(\S*?[^\s,])(?=,*(?:\s|$))/g;

function resolveSrcSet(srcSet: string, site: URL) {
	return srcSet.replaceAll(
		srcSetUrl,
		(_match, separator: string, space: string, url: string) =>
			`${separator}${space}${resolveUrl(url, site)}`,
	);
}

function resolveElementUrls(element: Element, site: URL) {
	for (const property of urlProperties) {
		const value = element.properties[property];

		if (typeof value === 'string') element.properties[property] = resolveUrl(value, site);
	}

	const srcSet = element.properties.srcSet;

	if (typeof srcSet === 'string') element.properties.srcSet = resolveSrcSet(srcSet, site);
}

export function prepareSyndicationHtml(
	html: string,
	{ schema = syndicationSchema, site }: { schema?: Schema; site: URL },
) {
	const tree = sanitize(fromHtml(html, { fragment: true }), schema);

	visit(tree, 'element', (element) => {
		resolveElementUrls(element, site);
	});

	return toHtml(tree);
}
