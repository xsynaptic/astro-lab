import type { RehypeWrapCjkOptions } from '@xsynaptic/rehype-wrap-cjk';

import { rehypeWrapCjk } from '@xsynaptic/rehype-wrap-cjk';
import { hash } from 'ohash';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import remarkSmartyPants from 'remark-smartypants';
import { unified } from 'unified';

interface TransformMarkdownOptions {
	input: string;
	wrapCjkOptions?: Partial<RehypeWrapCjkOptions> | undefined;
}

// Cache frozen processors by options hash
const processorCache = new Map<string, unknown>();

function createProcessorWithCjk(wrapCjkOptions: Partial<RehypeWrapCjkOptions>) {
	return unified()
		.use(remarkParse)
		.use(remarkSmartyPants)
		.use(remarkRehype)
		.use(rehypeSanitize)
		.use(rehypeWrapCjk, wrapCjkOptions)
		.use(rehypeStringify)
		.freeze();
}

// Processor without CJK wrapping
function createProcessorWithoutCjk() {
	return unified()
		.use(remarkParse)
		.use(remarkSmartyPants)
		.use(remarkRehype)
		.use(rehypeSanitize)
		.use(rehypeStringify)
		.freeze();
}

function getProcessor(wrapCjkOptions?: Partial<RehypeWrapCjkOptions>) {
	// Generate stable cache key from options (empty string for no options)
	const cacheKey = wrapCjkOptions ? hash(wrapCjkOptions) : '';

	let processor = processorCache.get(cacheKey);

	if (!processor) {
		processor = wrapCjkOptions
			? createProcessorWithCjk(wrapCjkOptions)
			: createProcessorWithoutCjk();
		processorCache.set(cacheKey, processor);
	}

	return processor as ReturnType<typeof createProcessorWithoutCjk>;
}

export function transformMarkdown({ input, wrapCjkOptions }: TransformMarkdownOptions): string {
	return getProcessor(wrapCjkOptions).processSync(input).toString().trim();
}
