import { fc, test } from '@fast-check/vitest';
import { markdownToHtml } from 'satteri';
import { describe, expect } from 'vitest';

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
		['//cdn/x', undefined],
	];

	test.each(alwaysCases)('always: %s', (href, expected) => {
		expect(normalizeHref(href, 'always')).toBe(expected);
	});

	const neverCases: Array<[string, string | undefined]> = [
		['/about/', '/about'],
		['/about/?q=1', '/about?q=1'],
		['/about/#s', '/about#s'],
		['/about//', '/about'],
		['/', undefined],
		['/about', undefined],
		['https://x/y/', undefined],
	];

	test.each(neverCases)('never: %s', (href, expected) => {
		expect(normalizeHref(href, 'never')).toBe(expected);
	});
});

const modes = ['always', 'never'] as const;

const segments = fc.array(fc.string({ maxLength: 3, unit: fc.constantFrom('a', 'b', '.', '-') }), {
	maxLength: 3,
	minLength: 1,
});

const rootRelativePath = fc
	.tuple(segments, fc.boolean())
	.map(([parts, isSlashed]) => `/${parts.join('/')}${isSlashed ? '/' : ''}`)
	.filter((path) => !path.startsWith('//'));

const suffix = fc.constantFrom('', '?q=1', '#top', '?next=/a/', '#a?b', '?a#b/');

const otherHref = fc
	.tuple(
		fc.constantFrom('https://x.test', '//cdn.test', 'mailto:me', '#', 'relative', './', '../'),
		rootRelativePath,
		suffix,
	)
	.map(([prefix, path, tail]) => `${prefix}${path}${tail}`);

const directoryPath = fc
	.array(fc.string({ maxLength: 3, minLength: 1, unit: fc.constantFrom('a', 'b', '-') }), {
		maxLength: 3,
		minLength: 1,
	})
	.map((parts) => `/${parts.join('/')}/`);

describe('normalizeHref properties', () => {
	test.prop([otherHref, fc.constantFrom(...modes)])(
		'leaves every href that is not root-relative alone',
		(href, mode) => {
			expect(normalizeHref(href, mode)).toBeUndefined();
		},
	);

	test.prop([rootRelativePath, suffix, fc.constantFrom(...modes)])(
		'keeps the query and hash exactly as written',
		(path, tail, mode) => {
			const result = normalizeHref(`${path}${tail}`, mode) ?? `${path}${tail}`;

			expect(result.slice(result.length - tail.length)).toBe(tail);
			expect(result.slice(0, result.length - tail.length)).not.toMatch(/[?#]/);
		},
	);

	test.prop([rootRelativePath, suffix, fc.constantFrom(...modes)])(
		'needs no second pass over an href it has normalized',
		(path, tail, mode) => {
			const once = normalizeHref(`${path}${tail}`, mode) ?? `${path}${tail}`;

			expect(normalizeHref(once, mode)).toBeUndefined();
		},
	);

	test.prop([directoryPath, suffix])('puts back the slash that never took off', (path, tail) => {
		const stripped = normalizeHref(`${path}${tail}`, 'never');

		expect(stripped).toBeDefined();
		expect(normalizeHref(stripped ?? '', 'always')).toBe(`${path}${tail}`);
	});
});
