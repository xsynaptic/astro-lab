import type { Loader, LoaderContext } from 'astro/loaders';

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { SitemapLastmodFile } from './file.js';

import { normalizePathname } from './file.js';

export type SitemapLastmodEntry = ReturnType<LoaderContext['store']['values']>[number];

export type SitemapLastmodPair = readonly [pathname: string, date: Date | string | undefined];

interface SitemapLastmodWriterOptions {
	filePath: string;
}

function toIsoDate(pathname: string, date: Date | string) {
	const parsed = date instanceof Date ? date : new Date(date);

	if (Number.isNaN(parsed.getTime())) {
		throw new TypeError(`Invalid lastmod date for ${pathname}: ${String(date)}`);
	}

	return parsed.toISOString();
}

export function createSitemapLastmodWriter({ filePath }: SitemapLastmodWriterOptions) {
	const resolvedPath = path.resolve(filePath);
	const dates = new Map<string, string>();

	function record(pairs: Iterable<SitemapLastmodPair>) {
		for (const [pathname, date] of pairs) {
			if (date === undefined) continue;

			const key = normalizePathname(pathname);
			const isoDate = toIsoDate(pathname, date);
			const existing = dates.get(key);

			if (existing === undefined || existing < isoDate) dates.set(key, isoDate);
		}

		const file = {
			generatedAt: new Date().toISOString(),
			urls: Object.fromEntries(dates),
		} satisfies SitemapLastmodFile;

		mkdirSync(path.dirname(resolvedPath), { recursive: true });
		writeFileSync(resolvedPath, JSON.stringify(file, undefined, '\t'));

		return dates.size;
	}

	function wrap(
		loader: Loader,
		getPaths: (entry: SitemapLastmodEntry) => Iterable<SitemapLastmodPair>,
	): Loader {
		return {
			...loader,
			load: async (context) => {
				await loader.load(context);
				record(context.store.values().flatMap((entry) => [...getPaths(entry)]));
			},
		};
	}

	return { record, wrap };
}
