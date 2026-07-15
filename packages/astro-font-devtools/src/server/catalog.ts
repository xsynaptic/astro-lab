import type { Connect } from 'vite';

import type { CatalogFont, ProviderName } from '../shared/types.js';

import { memoizeByProviders } from './provider-cache.js';
import { bunnyCatalog } from './providers/bunny.js';
import { fontshareCatalog } from './providers/fontshare.js';
import { fontsourceCatalog } from './providers/fontsource.js';
import { googleCatalog, googlePopularityMap } from './providers/google.js';

const adapters: Record<ProviderName, () => Promise<Array<CatalogFont>>> = {
	bunny: bunnyCatalog,
	fontshare: fontshareCatalog,
	fontsource: fontsourceCatalog,
	google: googleCatalog,
};

const buildCatalog = memoizeByProviders(assembleCatalog);

export async function assembleCatalog(providers: Array<ProviderName>): Promise<Array<CatalogFont>> {
	const [results, popularity] = await Promise.all([
		Promise.allSettled(providers.map((name) => adapters[name]())),
		loadPopularityMap(),
	]);

	for (const [index, result] of results.entries()) {
		if (result.status !== 'rejected') {
			continue;
		}

		const reason = result.reason instanceof Error ? result.reason.message : 'unknown';
		console.warn(
			`[astro-font-devtools] ${providers[index] ?? 'provider'} catalog failed: ${reason}`,
		);
	}

	const lists = results
		.filter(
			(result): result is PromiseFulfilledResult<Array<CatalogFont>> =>
				result.status === 'fulfilled',
		)
		.map((result) => result.value);

	if (lists.length === 0) throw new Error('all font providers failed to load');

	const byFamily = new Map<string, CatalogFont>();

	for (const font of lists.flat()) {
		const existing = byFamily.get(font.family);
		if (existing) {
			for (const provider of font.providers) {
				if (!existing.providers.includes(provider)) existing.providers.push(provider);
			}

			for (const script of font.scripts) {
				if (!existing.scripts.includes(script)) existing.scripts.push(script);
			}

			continue;
		}

		if (font.popularity === undefined) {
			const joined = popularity.get(font.family);

			if (joined) {
				font.popularity = joined.popularity;
				font.trending = joined.trending;
			}
		}

		byFamily.set(font.family, font);
	}

	return [...byFamily.values()].toSorted(
		(first, second) => (first.popularity ?? Infinity) - (second.popularity ?? Infinity),
	);
}

export function createCatalogHandler(providers: Array<ProviderName>): Connect.NextHandleFunction {
	return (_req, res) => {
		void (async () => {
			try {
				const catalog = await buildCatalog(providers);
				res.setHeader('content-type', 'application/json');
				res.setHeader('cache-control', 'no-store');
				res.end(JSON.stringify(catalog));
			} catch (error) {
				res.statusCode = 502;
				res.setHeader('content-type', 'application/json');
				res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'unknown' }));
			}
		})();
	};
}

async function loadPopularityMap(): Promise<Map<string, { popularity: number; trending: number }>> {
	try {
		return await googlePopularityMap();
	} catch {
		return new Map();
	}
}
