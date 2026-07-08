import { markdownToHtml } from 'satteri';
import { describe, expect, test } from 'vitest';

import type { TrailingSlashOptions } from '../src/index.js';

import { normalizeHref, trailingSlash } from '../src/index.js';

function link(href: string): string {
	return `[x](${href})`;
}

async function render(source: string, options?: Readonly<TrailingSlashOptions>): Promise<string> {
	const result = await markdownToHtml(source, { hastPlugins: [trailingSlash(options)] });

	return result.html.trim();
}

// Smoke the wiring into satteri and that a rewritten href survives real HTML serialization;
// the exhaustive path logic lives in the normalizeHref unit tests below
describe('rendered through satteri', () => {
	test("'always' appends the slash and keeps any suffix", async () => {
		const options = { trailingSlash: 'always' } as const;

		expect(await render(link('/about'), options)).toContain('href="/about/"');
		expect(await render(link('/about?q=1'), options)).toContain('href="/about/?q=1"');
	});

	test("'never' strips the slash and keeps any suffix", async () => {
		const options = { trailingSlash: 'never' } as const;

		expect(await render(link('/about/'), options)).toContain('href="/about"');
		expect(await render(link('/about/?q=1'), options)).toContain('href="/about?q=1"');
	});

	test('leaves non-internal links untouched', async () => {
		const options = { trailingSlash: 'always' } as const;

		expect(await render(link('https://x/y'), options)).toContain('href="https://x/y"');
		expect(await render(link('/rss.xml'), options)).toContain('href="/rss.xml"');
	});

	test("'ignore', the default, rewrites nothing", async () => {
		expect(await render(link('/about'), { trailingSlash: 'ignore' })).toContain('href="/about"');
		expect(await render(link('/about'))).toContain('href="/about"');
	});
});

describe('normalizeHref', () => {
	const alwaysCases: Array<[string, string | undefined]> = [
		['/about', '/about/'],
		['/about?q=1', '/about/?q=1'],
		['/about#s', '/about/#s'],
		['/', undefined],
		['/already/', undefined],
		['/rss.xml', undefined],
		['https://x/y', undefined],
		['#anchor', undefined],
		['mailto:a@b.com', undefined],
		['//cdn/x', undefined],
	];

	test.each(alwaysCases)('always: %s', (href, expected) => {
		expect(normalizeHref(href, 'always')).toBe(expected);
	});

	const neverCases: Array<[string, string | undefined]> = [
		['/about/', '/about'],
		['/about/?q=1', '/about?q=1'],
		['/about/#s', '/about#s'],
		['/', undefined],
		['/about', undefined],
		['https://x/y/', undefined],
		['//cdn/x/', undefined],
	];

	test.each(neverCases)('never: %s', (href, expected) => {
		expect(normalizeHref(href, 'never')).toBe(expected);
	});
});
