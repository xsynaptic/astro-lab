import * as z from 'zod';

import type { CatalogFont } from '../../shared/types.js';

import { normalizeCategory, parseFonts } from './normalize.js';

const bunnyFontSchema = z.object({
	category: z.string(),
	familyName: z.string(),
	isVariable: z.boolean(),
	styles: z.array(z.string()),
	variants: z.record(z.string(), z.unknown()),
	weights: z.array(z.number()),
});
const bunnyListSchema = z.record(z.string(), z.unknown());

export async function bunnyCatalog(): Promise<Array<CatalogFont>> {
	const response = await fetch('https://fonts.bunny.net/list');
	const list = bunnyListSchema.parse(await response.json());

	return parseFonts(Object.values(list), bunnyFontSchema, 'bunny').map((font) => ({
		category: normalizeCategory(font.category),
		family: font.familyName,
		italic: font.styles.includes('italic'),
		providers: ['bunny'],
		scripts: Object.keys(font.variants),
		variable: font.isVariable,
		weights: font.weights,
	}));
}
