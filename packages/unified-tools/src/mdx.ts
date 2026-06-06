import type { Options as RehypeSanitizeOptions } from 'rehype-sanitize';

import { hash } from 'ohash';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

// Cache frozen processors by options hash
const processorCache = new Map<string, unknown>();

// Default options for stripping all tags
const defaultOptions: RehypeSanitizeOptions = { tagNames: [] };

export function sanitizeMdx(input: string, options?: RehypeSanitizeOptions): string {
	return String(getProcessor(options).processSync(input))
		.replaceAll(/\s+/g, ' ') // Normalize whitespace
		.trim();
}

function createProcessor(options: RehypeSanitizeOptions) {
	return unified()
		.use(remarkParse)
		.use(remarkMdx)
		.use(remarkRehype)
		.use(rehypeSanitize, options)
		.use(rehypeStringify)
		.freeze();
}

function getProcessor(options?: RehypeSanitizeOptions) {
	const effectiveOptions = options ?? defaultOptions;
	const cacheKey = hash(effectiveOptions);

	let processor = processorCache.get(cacheKey);

	if (!processor) {
		processor = createProcessor(effectiveOptions);
		processorCache.set(cacheKey, processor);
	}

	return processor as ReturnType<typeof createProcessor>;
}
