import type { RehypeWrapCjkOptions } from '@xsynaptic/rehype-wrap-cjk';
import type { Options as SmartypantsOptions } from 'retext-smartypants';

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
	smartypantsOptions?: SmartypantsOptions | undefined;
	wrapCjkOptions?: Partial<RehypeWrapCjkOptions> | undefined;
}

const defaultSmartypantsOptions: SmartypantsOptions = { dashes: 'oldschool' };

// Cache frozen processors by options hash
const processorCache = new Map<string, unknown>();

export function transformMarkdown({
	input,
	smartypantsOptions,
	wrapCjkOptions,
}: TransformMarkdownOptions): string {
	const resolvedSmartypantsOptions = { ...defaultSmartypantsOptions, ...smartypantsOptions };

	return getProcessor(resolvedSmartypantsOptions, wrapCjkOptions)
		.processSync(input)
		.toString()
		.trim();
}

function createProcessorWithCjk(
	smartypantsOptions: SmartypantsOptions,
	wrapCjkOptions: Partial<RehypeWrapCjkOptions>,
) {
	return unified()
		.use(remarkParse)
		.use(remarkSmartyPants, smartypantsOptions)
		.use(remarkRehype)
		.use(rehypeSanitize)
		.use(rehypeWrapCjk, wrapCjkOptions)
		.use(rehypeStringify)
		.freeze();
}

// Processor without CJK wrapping
function createProcessorWithoutCjk(smartypantsOptions: SmartypantsOptions) {
	return unified()
		.use(remarkParse)
		.use(remarkSmartyPants, smartypantsOptions)
		.use(remarkRehype)
		.use(rehypeSanitize)
		.use(rehypeStringify)
		.freeze();
}

function getProcessor(
	smartypantsOptions: SmartypantsOptions,
	wrapCjkOptions?: Partial<RehypeWrapCjkOptions>,
) {
	const cacheKey = hash({ smartypantsOptions, wrapCjkOptions });

	let processor = processorCache.get(cacheKey);

	if (!processor) {
		processor = wrapCjkOptions
			? createProcessorWithCjk(smartypantsOptions, wrapCjkOptions)
			: createProcessorWithoutCjk(smartypantsOptions);
		processorCache.set(cacheKey, processor);
	}

	return processor as ReturnType<typeof createProcessorWithoutCjk>;
}
