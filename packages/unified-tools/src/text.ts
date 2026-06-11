import type { Options as RetextSmartypantsOptions } from 'retext-smartypants';

import { hash } from 'ohash';
import { retext } from 'retext';
import retextSmartypants from 'retext-smartypants';

const defaultOptions: RetextSmartypantsOptions = { dashes: 'oldschool' };

// Cache frozen processors by options hash
const processorCache = new Map<string, unknown>();

export function stylizeText(input: string, options?: RetextSmartypantsOptions): string {
	const resolvedOptions = { ...defaultOptions, ...options };

	return String(getProcessor(resolvedOptions).processSync(input)).trim();
}

function createProcessor(options: RetextSmartypantsOptions) {
	return retext().use(retextSmartypants, options).freeze();
}

function getProcessor(options: RetextSmartypantsOptions) {
	const cacheKey = hash(options);

	let processor = processorCache.get(cacheKey);

	if (!processor) {
		processor = createProcessor(options);
		processorCache.set(cacheKey, processor);
	}

	return processor as ReturnType<typeof createProcessor>;
}
