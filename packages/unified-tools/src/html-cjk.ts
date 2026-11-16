import type { RehypeWrapCjkOptions } from '@xsynaptic/rehype-wrap-cjk';
import type { Options as RehypeSanitizeOptions } from 'rehype-sanitize';

import { rehypeWrapCjk, resolveWrapper } from '@xsynaptic/rehype-wrap-cjk';
import { hash } from 'ohash';
import rehypeParse from 'rehype-parse';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';

// Cache frozen processors by options hash
const processorCache = new Map<string, unknown>();

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
