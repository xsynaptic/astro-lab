import type { CSSToken } from '@csstools/css-tokenizer';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FontFaceData } from 'unifont';

import { tokenize, TokenType } from '@csstools/css-tokenizer';
import { fc, it } from '@fast-check/vitest';
import { beforeEach, describe, expect, vi } from 'vitest';

import type { ProviderName } from '../../src/shared/types.js';

import {
	createResolveHandler,
	parseResolveQuery,
	renderFontFace,
} from '../../src/server/resolve.js';
import { providerNames } from '../../src/shared/types.js';

const { resolveFont } = vi.hoisted(() => ({ resolveFont: vi.fn() }));

vi.mock('unifont', () => ({
	createUnifont: () => Promise.resolve({ resolveFont }),
	providers: {
		bunny: () => ({}),
		fontshare: () => ({}),
		fontsource: () => ({}),
		google: () => ({}),
	},
}));

const configured: Array<ProviderName> = ['google', 'fontsource'];

// Resolves once the handler calls res.end()
function runHandler(handler: ReturnType<typeof createResolveHandler>, url: string) {
	return new Promise<{ body: string; headers: Record<string, string>; statusCode: number }>(
		(resolve) => {
			const res = {
				body: '',
				end(chunk = '') {
					res.body = chunk;
					resolve({ body: res.body, headers: res.headers, statusCode: res.statusCode });
				},
				headers: {} as Record<string, string>,
				setHeader(key: string, value: string) {
					res.headers[key] = value;
				},
				statusCode: 200,
			};
			handler({ url } as unknown as IncomingMessage, res as unknown as ServerResponse, vi.fn());
		},
	);
}

beforeEach(() => {
	resolveFont.mockReset();
});

describe('renderFontFace', () => {
	it('renders url sources with format/weight/style and omits or adds optional fields', () => {
		expect(
			renderFontFace('Inter', {
				src: [{ format: 'woff2', url: '/inter.woff2' }],
				style: 'normal',
				weight: 400,
			} satisfies FontFaceData),
		).toBe(
			'@font-face { font-family: "Inter"; src: url("/inter.woff2") format("woff2"); font-display: swap; font-weight: 400; font-style: normal; }',
		);
		expect(renderFontFace('Inter', { src: [{ url: '/a.woff2' }] } satisfies FontFaceData)).toBe(
			'@font-face { font-family: "Inter"; src: url("/a.woff2"); font-display: swap; }',
		);
		expect(
			renderFontFace('Inter', {
				src: [{ url: '/a.woff2' }],
				unicodeRange: ['U+0000-00FF', 'U+0131'],
			} satisfies FontFaceData),
		).toContain('unicode-range: U+0000-00FF, U+0131');
	});

	it('escapes quotes, backslashes and newlines in the strings it writes', () => {
		const css = renderFontFace(String.raw`A"B\C`, {
			src: [{ name: 'x\ny' }, { url: '/a"b.woff2' }],
		} satisfies FontFaceData);

		expect(css).toContain(String.raw`font-family: "A\"B\\C"`);
		expect(css).toContain(String.raw`local("x\a y")`);
		expect(css).toContain(String.raw`url("/a\"b.woff2")`);
	});

	it('renders local() sources and joins a variable weight range', () => {
		const css = renderFontFace('Inter', {
			src: [{ name: 'Inter' }],
			weight: [400, 700],
		} satisfies FontFaceData);
		expect(css).toContain('src: local("Inter")');
		expect(css).toContain('font-weight: 400 700');
	});
});

const cssStringHazard = fc.string({
	maxLength: 8,
	minLength: 1,
	unit: fc.constantFrom(
		'"',
		"'",
		'\\',
		'\n',
		'\r',
		'\f',
		';',
		'{',
		'}',
		'(',
		')',
		'a',
		'F',
		'1',
		' ',
		'中',
	),
});

function significantTokens(css: string) {
	return tokenize({ css }).filter(
		(token) => token[0] !== TokenType.Whitespace && token[0] !== TokenType.EOF,
	);
}

function stringAt(token: CSSToken | undefined) {
	return token?.[0] === TokenType.String ? token[4].value : undefined;
}

function identNamed(name: string) {
	return (token: CSSToken) => token[0] === TokenType.Ident && token[4].value === name;
}

function functionNamed(name: string) {
	return (token: CSSToken) => token[0] === TokenType.Function && token[4].value === name;
}

describe('renderFontFace properties', () => {
	it.prop([cssStringHazard, cssStringHazard, cssStringHazard])(
		'every string parses back exactly, inside one closed block',
		(family, name, url) => {
			const tokens = significantTokens(
				renderFontFace(family, {
					src: [{ name }, { format: 'woff2', url }],
				} satisfies FontFaceData),
			);
			const familyIndex = tokens.findIndex(identNamed('font-family'));

			expect(tokens[familyIndex + 1]?.[0]).toBe(TokenType.Colon);
			expect(stringAt(tokens[familyIndex + 2])).toBe(family);
			expect(stringAt(tokens[tokens.findIndex(functionNamed('local')) + 1])).toBe(name);
			expect(stringAt(tokens[tokens.findIndex(functionNamed('url')) + 1])).toBe(url);
			expect(tokens.filter((token) => token[0] === TokenType.CloseCurly)).toHaveLength(1);
			expect(tokens.at(-1)?.[0]).toBe(TokenType.CloseCurly);
		},
	);
});

const queryProvider = fc.option(
	fc.constantFrom(...providerNames, 'nope', '', '__proto__', 'hasOwnProperty'),
	{ nil: undefined },
);

describe('parseResolveQuery', () => {
	it('scopes to a subset of the configured providers', () => {
		let narrowed = 0;

		fc.assert(
			fc.property(fc.subarray([...providerNames]), queryProvider, (providers, provider) => {
				const params = new URLSearchParams({ family: 'Inter' });

				if (provider !== undefined) params.set('provider', provider);

				const scoped = parseResolveQuery(`/resolve?${params.toString()}`, providers)?.scoped;

				if (scoped && scoped.length < providers.length) narrowed += 1;

				expect(scoped?.filter((name) => !providers.includes(name))).toEqual([]);
			}),
		);

		expect(narrowed).toBeGreaterThan(0);
	});

	it('applies default weights and styles', () => {
		expect(parseResolveQuery('/resolve?family=Inter', ['fontsource'])).toEqual({
			family: 'Inter',
			scoped: ['fontsource'],
			styles: ['normal', 'italic'],
			subsets: [],
			weights: ['400', '700'],
		});
	});

	it('parses custom weights and drops style values that are not real font styles', () => {
		expect(
			parseResolveQuery('/resolve?family=Inter&weights=300,600&styles=normal,bogus', [
				'fontsource',
			]),
		).toMatchObject({ styles: ['normal'], weights: ['300', '600'] });
	});

	it('scopes to a single provider when the query names a configured one', () => {
		expect(parseResolveQuery('/resolve?family=Inter&provider=google', configured)?.scoped).toEqual([
			'google',
		]);
	});

	it('falls back to all providers for an unknown or unconfigured provider', () => {
		expect(parseResolveQuery('/resolve?family=Inter&provider=nope', configured)?.scoped).toEqual(
			configured,
		);
		expect(parseResolveQuery('/resolve?family=Inter&provider=bunny', configured)?.scoped).toEqual(
			configured,
		);
	});
});

describe('createResolveHandler', () => {
	it('returns 400 when family is missing', async () => {
		const result = await runHandler(createResolveHandler(['fontsource']), '/resolve');

		expect(result.statusCode).toBe(400);
		expect(result.body).toContain('missing family');
		expect(resolveFont).not.toHaveBeenCalled();
	});

	it('renders resolved fonts as CSS with text/css and no-store', async () => {
		resolveFont.mockResolvedValue({ fonts: [{ src: [{ url: '/inter.woff2' }] }] });
		const result = await runHandler(createResolveHandler(['fontsource']), '/resolve?family=Inter');

		expect(result.statusCode).toBe(200);
		expect(result.headers['content-type']).toBe('text/css');
		expect(result.headers['cache-control']).toBe('no-store');
		expect(result.body).toContain('@font-face');
	});

	it('forwards requested subsets and omits the option when none are given', async () => {
		resolveFont.mockResolvedValue({ fonts: [{ src: [{ url: '/a.woff2' }] }] });

		await runHandler(
			createResolveHandler(['fontsource']),
			'/resolve?family=Inter&subsets=latin,cyrillic',
		);
		expect(resolveFont).toHaveBeenLastCalledWith(
			'Inter',
			expect.objectContaining({ subsets: ['latin', 'cyrillic'] }),
		);

		await runHandler(createResolveHandler(['fontsource']), '/resolve?family=Inter');
		expect(resolveFont.mock.lastCall?.[1]).not.toHaveProperty('subsets');
	});

	it('returns 502 when resolution fails', async () => {
		resolveFont.mockRejectedValue(new Error('upstream down'));
		const result = await runHandler(createResolveHandler(['fontsource']), '/resolve?family=Inter');

		expect(result.statusCode).toBe(502);
		expect(result.body).toContain('resolve failed');
	});
});
