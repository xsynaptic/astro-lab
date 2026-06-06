import type { Options as RehypeSanitizeOptions } from 'rehype-sanitize';

import { hash } from 'ohash';
import rehypeParse from 'rehype-parse';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';

// Cache frozen processors by options hash
const processorCache = new Map<string, unknown>();

function createProcessor(options?: RehypeSanitizeOptions) {
	return unified()
		.use(rehypeParse, { fragment: true })
		.use(rehypeSanitize, options)
		.use(rehypeStringify)
		.freeze();
}

function getProcessor(options?: RehypeSanitizeOptions) {
	const cacheKey = options ? hash(options) : '';

	let processor = processorCache.get(cacheKey);

	if (!processor) {
		processor = createProcessor(options);
		processorCache.set(cacheKey, processor);
	}

	return processor as ReturnType<typeof createProcessor>;
}

export function sanitizeHtml(input: string, options?: RehypeSanitizeOptions): string {
	const processor = getProcessor(options);

	return String(processor.processSync(input));
}

// Handy shortcut for when you just want to strip tags from text
export function stripTags(input: string, options?: RehypeSanitizeOptions): string {
	return sanitizeHtml(input, { ...options, tagNames: [] });
}
