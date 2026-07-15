import * as z from 'zod';

import type { CatalogFont } from '../../shared/types.js';

import { normalizeCategory, parseFonts } from './normalize.js';

const fontshareFontSchema = z.object({
	category: z.string(),
	name: z.string(),
	script: z.string(),
	styles: z.array(
		z.object({
			is_italic: z.boolean(),
			is_variable: z.boolean(),
			weight: z.object({ weight: z.number() }),
		}),
	),
	views: z.number(),
	views_recent: z.number(),
});

const fontsharePageSchema = z.object({ fonts: z.array(z.unknown()), has_more: z.boolean() });

type FontshareFont = z.infer<typeof fontshareFontSchema>;

export async function fontshareCatalog(): Promise<Array<CatalogFont>> {
	const fonts: Array<FontshareFont> = [];
	// Fontshare's `offset` counts items, not pages, so advance by however many fonts the page actually returned
	// Keep going until the API reports no more or returns an empty page
	let offset = 0;
	let hasMore = true;

	while (hasMore) {
		const response = await fetch(
			`https://api.fontshare.com/v2/fonts?limit=100&offset=${String(offset)}`,
		);
		const chunk = fontsharePageSchema.parse(await response.json());

		fonts.push(...parseFonts(chunk.fonts, fontshareFontSchema, 'fontshare'));
		hasMore = chunk.has_more && chunk.fonts.length > 0;
		offset += chunk.fonts.length;
	}

	const popularityRank = rankByDescending(fonts, (font) => font.views);
	const trendingRank = rankByDescending(fonts, (font) => font.views_recent);

	return fonts.map((font) => {
		const weights = [...new Set(font.styles.map((style) => style.weight.weight))].toSorted(
			(first, second) => first - second,
		);
		const entry: CatalogFont = {
			category: normalizeCategory(font.category),
			family: font.name,
			italic: font.styles.some((style) => style.is_italic),
			providers: ['fontshare'],
			scripts: [font.script],
			variable: font.styles.some((style) => style.is_variable),
			weights,
		};
		const popularity = popularityRank.get(font.name);
		const trending = trendingRank.get(font.name);

		if (popularity !== undefined) entry.popularity = popularity;
		if (trending !== undefined) entry.trending = trending;

		return entry;
	});
}

function rankByDescending(
	items: Array<FontshareFont>,
	score: (item: FontshareFont) => number,
): Map<string, number> {
	const sorted = items.toSorted((first, second) => score(second) - score(first));

	return new Map(sorted.map((item, index) => [item.name, index + 1]));
}
