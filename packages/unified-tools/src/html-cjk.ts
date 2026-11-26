import type { RehypeWrapCjkOptions } from '@xsynaptic/rehype-wrap-cjk';
import type { Properties, Root } from 'hast';
import type { Options as RehypeSanitizeOptions } from 'rehype-sanitize';

import { rehypeWrapCjk, resolveWrapper } from '@xsynaptic/rehype-wrap-cjk';
import { hash } from 'ohash';
import rehypeParse from 'rehype-parse';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

// Cache frozen processors by options hash
const processorCache = new Map<string, unknown>();

const clobber = defaultSchema.clobber ?? [];
const clobberPrefix = defaultSchema.clobberPrefix ?? '';

function removePrefix<Value>(value: Value) {
	return typeof value === 'string' && value.startsWith(clobberPrefix)
		? value.slice(clobberPrefix.length)
		: value;
}

function removeClobberPrefix(value: Properties[string]) {
	if (Array.isArray(value)) return value.map((item) => removePrefix(item));

	return removePrefix(value);
}

function removeClobberPrefixes(tree: Root) {
	visit(tree, 'element', (element) => {
		for (const property of clobber) {
			const value = element.properties[property];

			if (value !== undefined) element.properties[property] = removeClobberPrefix(value);
		}
	});
}

// Sanitizing prefixes these properties unconditionally, so wrapped output fed back in would carry the prefix twice
function rehypeRemoveClobberPrefix() {
	return removeClobberPrefixes;
}

function createWrapperSchema(wrapCjkOptions: Partial<RehypeWrapCjkOptions>) {
	const { element, property, value } = resolveWrapper(wrapCjkOptions);
	const elementAttributes = defaultSchema.attributes?.[element] ?? [];

	return {
		...defaultSchema,
		attributes: {
			...defaultSchema.attributes,
			[element]: [...elementAttributes, [property, value]],
		},
	} satisfies RehypeSanitizeOptions;
}

function createProcessor(wrapCjkOptions: Partial<RehypeWrapCjkOptions>) {
	return unified()
		.use(rehypeParse, { fragment: true })
		.use(rehypeRemoveClobberPrefix)
		.use(rehypeSanitize, createWrapperSchema(wrapCjkOptions))
		.use(rehypeWrapCjk, wrapCjkOptions)
		.use(rehypeStringify)
		.freeze();
}

function getProcessor(wrapCjkOptions: Partial<RehypeWrapCjkOptions>) {
	const cacheKey = hash(wrapCjkOptions);

	let processor = processorCache.get(cacheKey);

	if (!processor) {
		processor = createProcessor(wrapCjkOptions);
		processorCache.set(cacheKey, processor);
	}

	return processor as ReturnType<typeof createProcessor>;
}

// Pre-defined options for common language codes
const zhOptions: Partial<RehypeWrapCjkOptions> = {
	attribute: 'lang',
	value: 'zh',
};
const jaOptions: Partial<RehypeWrapCjkOptions> = {
	attribute: 'lang',
	value: 'ja',
};
const koOptions: Partial<RehypeWrapCjkOptions> = {
	attribute: 'lang',
	value: 'ko',
};

export function wrapChinese(input: string): string {
	return getProcessor(zhOptions).processSync(input).toString();
}

// wrapCjkOptions is required so a no-op call cannot be written; pass `{}` for the default `cjk` preset
export function wrapCjk({
	input,
	wrapCjkOptions,
}: {
	input: string;
	wrapCjkOptions: Partial<RehypeWrapCjkOptions>;
}): string {
	return getProcessor(wrapCjkOptions).processSync(input).toString();
}

export function wrapJapanese(input: string): string {
	return getProcessor(jaOptions).processSync(input).toString();
}

export function wrapKorean(input: string): string {
	return getProcessor(koOptions).processSync(input).toString();
}
