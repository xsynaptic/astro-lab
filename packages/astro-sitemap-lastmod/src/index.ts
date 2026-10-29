import type { AstroIntegration, AstroIntegrationLogger } from 'astro';

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { SitemapLastmodFile } from './file.js';

import { normalizePathname } from './file.js';

interface SitemapLastmodOptions {
	filePath: string;
}

type LastmodRead =
	| { error: string; status: 'invalid' }
	| { file: SitemapLastmodFile; status: 'found' }
	| { status: 'missing' };

interface LastmodLookup {
	dates: Map<string, string>;
	read: LastmodRead;
}

interface MatchCounts {
	filePath: string;
	hitCount: number;
	lookup: LastmodLookup | undefined;
	lookupCount: number;
}

type ReportLogger = Pick<AstroIntegrationLogger, 'info' | 'warn'>;

function isSitemapLastmodFile(value: unknown): value is SitemapLastmodFile {
	if (typeof value !== 'object' || value === null) return false;
	if (!('urls' in value) || typeof value.urls !== 'object' || value.urls === null) return false;
	if (Array.isArray(value.urls)) return false;

	return Object.values(value.urls).every((date) => typeof date === 'string');
}

function readLastmodFile(filePath: string): LastmodRead {
	if (!existsSync(filePath)) return { status: 'missing' };

	try {
		const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));

		if (!isSitemapLastmodFile(parsed)) {
			return { error: 'not a sitemap lastmod file', status: 'invalid' };
		}

		return { file: parsed, status: 'found' };
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error), status: 'invalid' };
	}
}

function loadLookup(filePath: string): LastmodLookup {
	const read = readLastmodFile(filePath);

	if (read.status === 'invalid') {
		console.warn(
			`[@xsynaptic/astro-sitemap-lastmod] Couldn't use ${filePath} (${read.error}); the sitemap gets no lastmod dates`,
		);
	}

	if (read.status !== 'found') return { dates: new Map(), read };

	const dates = new Map(
		Object.entries(read.file.urls).map(([pathname, date]) => [normalizePathname(pathname), date]),
	);

	return { dates, read };
}

function reportMatches(
	logger: ReportLogger,
	{ filePath, hitCount, lookup, lookupCount }: MatchCounts,
) {
	if (!lookup) {
		logger.warn(
			'The sitemap never asked for a date. Pass lastmod.serialize to sitemap(), and list this integration after sitemap()',
		);
		return;
	}

	const { dates, read } = lookup;

	if (read.status === 'invalid') {
		logger.warn(`Couldn't use ${filePath} (${read.error}), so no sitemap URL has a lastmod`);
		return;
	}

	if (read.status === 'missing') {
		logger.info(`No lastmod file at ${filePath} yet, so no sitemap URL has a lastmod`);
		return;
	}

	if (hitCount === 0 && dates.size > 0) {
		logger.warn(
			`None of the ${String(lookupCount)} sitemap URLs matched a path in ${filePath}. Check that the dates were recorded, that both sides use the same file, and that the paths include the site's base`,
		);
		return;
	}

	logger.info(`${String(hitCount)} of ${String(lookupCount)} sitemap URLs have a lastmod`);
}

export function sitemapLastmod({ filePath }: SitemapLastmodOptions) {
	const resolvedPath = path.resolve(filePath);

	let lookup: LastmodLookup | undefined;
	let lookupCount = 0;
	let hitCount = 0;

	// Read on first use, so loading the Astro config never depends on the file existing yet
	function serialize<Item extends { lastmod?: string; url: string }>(item: Item) {
		if (!lookup) lookup = loadLookup(resolvedPath);

		const lastmod = lookup.dates.get(normalizePathname(item.url));

		lookupCount++;

		if (lastmod === undefined) return item;

		hitCount++;

		return { ...item, lastmod };
	}

	const integration = {
		hooks: {
			'astro:build:done': ({ logger }: { logger: ReportLogger }) => {
				reportMatches(logger, { filePath: resolvedPath, hitCount, lookup, lookupCount });
			},
		},
		name: '@xsynaptic/astro-sitemap-lastmod',
	} satisfies AstroIntegration;

	return { integration, serialize };
}
