import * as z from 'zod';

import type { CatalogFont } from '../../shared/types.js';

import { normalizeCategory, parseFonts } from './normalize.js';

const googleFontSchema = z.object({
	axes: z.array(z.unknown()), // Only the length is read
	category: z.string(),
	family: z.string(),
	fonts: z.record(z.string(), z.unknown()), // Keyed by weight
	popularity: z.number(),
	subsets: z.array(z.string()),
	trending: z.number(),
});

const googleMetaSchema = z.object({ familyMetadataList: z.array(z.unknown()) });

type GoogleFont = z.infer<typeof googleFontSchema>;

let googleMetaPromise: Promise<Array<GoogleFont>> | undefined;

export async function googleCatalog(): Promise<Array<CatalogFont>> {
	const fonts = await fetchGoogleMeta();

	return fonts.map((font) => {
		const entry: CatalogFont = {
			category: normalizeCategory(font.category),
			family: font.family,
			italic: Object.keys(font.fonts).some((key) => key.endsWith('i')),
			providers: ['google'],
			scripts: font.subsets,
			variable: font.axes.length > 0,
			weights: googleWeights(font.fonts),
		};

		if (typeof font.popularity === 'number') entry.popularity = font.popularity;
		if (typeof font.trending === 'number') entry.trending = font.trending;

		return entry;
	});
}

// Cross-provider popularity backbone:
// Fontsource/Bunny carry no usage signal of their own, so this joins Google's rank onto them by family name
export async function googlePopularityMap(): Promise<
	Map<string, { popularity: number; trending: number }>
> {
	const fonts = await fetchGoogleMeta();

	return new Map(
		fonts.map((font) => [font.family, { popularity: font.popularity, trending: font.trending }]),
	);
}

function fetchGoogleMeta(): Promise<Array<GoogleFont>> {
	googleMetaPromise ??= loadGoogleMeta();

	return googleMetaPromise;
}

function googleWeights(fonts: Record<string, unknown>): Array<number> {
	const weights = new Set<number>();

	for (const key of Object.keys(fonts)) {
		// eslint-disable-next-line unicorn/prefer-number-coercion -- keys carry an italic suffix (e.g. "400i"); parseInt reads the leading weight where Number() yields NaN
		const weight = Number.parseInt(key, 10);

		if (!Number.isNaN(weight)) weights.add(weight);
	}

	return [...weights].toSorted((first, second) => first - second);
}

async function loadGoogleMeta(): Promise<Array<GoogleFont>> {
	const response = await fetch('https://fonts.google.com/metadata/fonts');
	const text = await response.text();
	const json = text.replace(/^\)\]\}'[^\n]*\n/, ''); // strip XSSI prefix if present
	const { familyMetadataList } = googleMetaSchema.parse(JSON.parse(json));

	return parseFonts(familyMetadataList, googleFontSchema, 'google');
}
