import type * as z from 'zod';

import type { FontCategory, ProviderName } from '../../shared/types.js';

import { fontCategories } from '../../shared/types.js';

export function normalizeCategory(raw: string): FontCategory {
	const value = raw.toLowerCase().replaceAll(/\s+/g, '-');

	return fontCategories.find((category) => category === value) ?? 'other';
}

// Validate a provider's list per item: keep the ones that parse, drop the rest with a logged count
// This way a single malformed record shouldn't sink the whole catalog
export function parseFonts<Schema extends z.ZodType>(
	items: Array<unknown>,
	schema: Schema,
	provider: ProviderName,
): Array<z.infer<Schema>> {
	const valid: Array<z.infer<Schema>> = [];
	let dropped = 0;

	for (const item of items) {
		const result = schema.safeParse(item);
		if (result.success) {
			valid.push(result.data);
			continue;
		}

		dropped += 1;
	}

	if (dropped > 0) {
		console.warn(
			`[astro-font-devtools] ${provider}: skipped ${String(dropped)} font(s) with an unexpected shape`,
		);
	}

	return valid;
}
