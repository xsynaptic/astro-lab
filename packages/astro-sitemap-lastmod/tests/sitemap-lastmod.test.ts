import type { Loader, LoaderContext } from 'astro/loaders';

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { SitemapLastmodPair } from '../src/write.js';

import { sitemapLastmod } from '../src/index.js';
import { createSitemapLastmodWriter } from '../src/write.js';

interface TestEntry {
	data: Record<string, unknown>;
	id: string;
}

const siteUrl = 'https://example.com';

let filePath: string;

function createLogger() {
	return { info: vi.fn<(message: string) => void>(), warn: vi.fn<(message: string) => void>() };
}

function createLoader(entries: Array<TestEntry>): Loader {
	return {
		load: async (context) => {
			for (const entry of entries) context.store.set(entry);
		},
		name: 'test-loader',
	};
}

function getPaths(entry: TestEntry): Array<SitemapLastmodPair> {
	return [[`/${entry.id}`, String(entry.data.date)]];
}

function createLoaderContext() {
	const entries = new Map<string, TestEntry>();
	const store = {
		set: (entry: TestEntry) => entries.set(entry.id, entry),
		values: () => [...entries.values()],
	};

	return { store } as unknown as LoaderContext;
}

function serializeUrls(lastmod: ReturnType<typeof sitemapLastmod>, pathnames: Array<string>) {
	return pathnames.map((pathname) => lastmod.serialize({ url: `${siteUrl}${pathname}` }).lastmod);
}

beforeEach(async () => {
	const directory = await fs.mkdtemp(path.join(tmpdir(), 'sitemap-lastmod-'));

	filePath = path.join(directory, 'cache', 'sitemap-lastmod.json');
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('writer to serialize', () => {
	test('dates written for paths come back for the matching sitemap URLs', () => {
		const urlCount = createSitemapLastmodWriter({ filePath }).record([
			['/posts/first', '2026-01-01T00:00:00Z'],
			['/posts/second', new Date('2026-02-01T00:00:00Z')],
			['/posts/undated', undefined],
		]);

		expect(urlCount).toBe(2);
		expect(serializeUrls(sitemapLastmod({ filePath }), ['/posts/first', '/posts/second'])).toEqual([
			'2026-01-01T00:00:00.000Z',
			'2026-02-01T00:00:00.000Z',
		]);
	});

	test('a URL missing from the file gets the file’s generatedAt', async () => {
		createSitemapLastmodWriter({ filePath }).record([['/posts/first', '2026-01-01T00:00:00Z']]);

		const { generatedAt } = JSON.parse(await fs.readFile(filePath, 'utf8')) as {
			generatedAt: string;
		};

		expect(serializeUrls(sitemapLastmod({ filePath }), ['/about'])).toEqual([generatedAt]);
	});

	test('an unparseable date throws, naming the path', () => {
		const writer = createSitemapLastmodWriter({ filePath });

		expect(() => writer.record([['/posts/first', 'yesterday']])).toThrow('/posts/first');
	});
});

describe('merging', () => {
	test('calls accumulate, and the newest date wins on a shared path', () => {
		const writer = createSitemapLastmodWriter({ filePath });

		writer.record([
			['/posts', '2026-03-01T00:00:00Z'],
			['/posts/first', '2026-03-01T00:00:00Z'],
		]);

		const urlCount = writer.record([
			['/posts', '2026-01-01T00:00:00Z'],
			['/tags/travel', '2026-02-01T00:00:00Z'],
		]);

		expect(urlCount).toBe(3);
		expect(
			serializeUrls(sitemapLastmod({ filePath }), ['/posts', '/posts/first', '/tags/travel']),
		).toEqual(['2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z']);
	});

	test('wrapped loaders each add their collection to the file', async () => {
		const writer = createSitemapLastmodWriter({ filePath });
		const posts = writer.wrap(
			createLoader([{ data: { date: '2026-01-01T00:00:00Z' }, id: 'posts/first' }]),
			getPaths,
		);
		const tags = writer.wrap(
			createLoader([{ data: { date: '2026-02-01T00:00:00Z' }, id: 'tags/travel' }]),
			getPaths,
		);

		await posts.load(createLoaderContext());
		await tags.load(createLoaderContext());

		expect(serializeUrls(sitemapLastmod({ filePath }), ['/posts/first', '/tags/travel'])).toEqual([
			'2026-01-01T00:00:00.000Z',
			'2026-02-01T00:00:00.000Z',
		]);
	});
});

describe('trailing slashes', () => {
	test('paths match whichever side spells the trailing slash', () => {
		createSitemapLastmodWriter({ filePath }).record([
			['/posts/slashed/', '2026-01-01T00:00:00Z'],
			['/posts/bare', '2026-02-01T00:00:00Z'],
			['/', '2026-03-01T00:00:00Z'],
		]);

		expect(
			serializeUrls(sitemapLastmod({ filePath }), ['/posts/slashed', '/posts/bare/', '/']),
		).toEqual(['2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z']);
	});

	test('non-ASCII paths match the percent-encoded sitemap URL', () => {
		createSitemapLastmodWriter({ filePath }).record([['/places/台北/', '2026-01-01T00:00:00Z']]);

		const url = new URL('/places/台北/', siteUrl).href;

		expect(sitemapLastmod({ filePath }).serialize({ url }).lastmod).toBe(
			'2026-01-01T00:00:00.000Z',
		);
	});
});

describe('missing or unreadable file', () => {
	test('every URL falls back to the build time and the report says why', () => {
		vi.useFakeTimers({ now: new Date('2026-05-01T00:00:00Z') });

		const lastmod = sitemapLastmod({ filePath });
		const logger = createLogger();

		expect(serializeUrls(lastmod, ['/posts/first'])).toEqual(['2026-05-01T00:00:00.000Z']);

		lastmod.integration.hooks['astro:build:done']({ logger });

		expect(logger.info).toHaveBeenCalledWith(
			expect.stringMatching(/^No lastmod file at .* yet, so every sitemap URL got the build time$/),
		);
	});

	test('a file of the wrong shape falls back and warns', async () => {
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(
			filePath,
			JSON.stringify({ 'https://example.com/posts/first': '2026-01-01' }),
		);

		const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
		const lastmod = sitemapLastmod({ filePath });
		const logger = createLogger();

		serializeUrls(lastmod, ['/posts/first', '/about']);

		expect(consoleWarn).toHaveBeenCalledOnce();
		expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('not a sitemap lastmod file'));

		lastmod.integration.hooks['astro:build:done']({ logger });

		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not a sitemap lastmod file'));
	});
});

describe('match report', () => {
	test('counts the URLs that found a lastmod', () => {
		createSitemapLastmodWriter({ filePath }).record([['/posts/first', '2026-01-01T00:00:00Z']]);

		const lastmod = sitemapLastmod({ filePath });
		const logger = createLogger();

		serializeUrls(lastmod, ['/posts/first', '/about', '/']);
		lastmod.integration.hooks['astro:build:done']({ logger });

		expect(logger.info).toHaveBeenCalledWith('Found lastmod dates for 1 of 3 sitemap URLs');
		expect(logger.warn).not.toHaveBeenCalled();
	});

	test('warns when the file has paths and no URL matched', () => {
		createSitemapLastmodWriter({ filePath }).record([['/posts/first', '2026-01-01T00:00:00Z']]);

		const lastmod = sitemapLastmod({ filePath });
		const logger = createLogger();

		serializeUrls(lastmod, ['/base/posts/first', '/base/about']);
		lastmod.integration.hooks['astro:build:done']({ logger });

		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringMatching(/^None of the 2 sitemap URLs matched a path in /),
		);
		expect(logger.info).not.toHaveBeenCalled();
	});

	test('says the sitemap never asked for a date instead of reporting zero', () => {
		createSitemapLastmodWriter({ filePath }).record([['/posts/first', '2026-01-01T00:00:00Z']]);

		const lastmod = sitemapLastmod({ filePath });
		const logger = createLogger();

		lastmod.integration.hooks['astro:build:done']({ logger });

		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('never asked for a date'));
		expect(logger.info).not.toHaveBeenCalled();
	});
});
