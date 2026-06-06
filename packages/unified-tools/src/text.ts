import type { Options as RetextSmartypantsOptions } from 'retext-smartypants';

import { hash } from 'ohash';
import { retext } from 'retext';
import retextSmartypants from 'retext-smartypants';

// Cache frozen processors by options hash
const processorCache = new Map<string, unknown>();

export function stylizeText(input: string, options?: RetextSmartypantsOptions): string {
	return String(getProcessor(options).processSync(input)).trim();
}

function createProcessor(options?: RetextSmartypantsOptions) {
	return retext().use(retextSmartypants, options).freeze();
}

function getProcessor(options?: RetextSmartypantsOptions) {
	const cacheKey = options ? hash(options) : '';

	let processor = processorCache.get(cacheKey);

	if (!processor) {
		processor = createProcessor(options);
		processorCache.set(cacheKey, processor);
	}

	return processor as ReturnType<typeof createProcessor>;
}
