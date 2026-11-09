import type { Element, ElementContent } from 'hast';

import { fc, test } from '@fast-check/vitest';
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import { visit } from 'unist-util-visit';
import { describe, expect } from 'vitest';

import { prepareSyndicationHtml, syndicationSchema } from '../src/html.js';

const site = new URL('https://mtacentral.com/');

function prepare(html: string) {
	return prepareSyndicationHtml(html, { site });
}

function getUrls(html: string) {
	const urls: Array<string> = [];

	visit(fromHtml(html, { fragment: true }), 'element', (element) => {
		const url = element.properties.href ?? element.properties.src;

		if (typeof url === 'string') urls.push(url);
	});

	return urls;
}

function paragraph(children: Array<ElementContent>): Element {
	return { children, properties: {}, tagName: 'p', type: 'element' };
}

const pathSegment = fc.stringMatching(/^[\w-]{1,8}$/);

const rootRelativeUrl = fc
	.array(pathSegment, { maxLength: 4, minLength: 1 })
	.map((segments) => `/${segments.join('/')}`);

const webUrl = fc.webUrl({ withFragments: true, withQueryParameters: true });

const selfContainedSrc = fc.oneof(
	webUrl,
	webUrl.map((url) => url.replace(/^https?:/, '')),
);

const selfContainedHref = fc.oneof(
	selfContainedSrc,
	pathSegment.map((fragment) => `#${fragment}`),
	pathSegment.map((user) => `mailto:${user}@example.com`),
	fc.stringMatching(/^\+\d{6,12}$/).map((number) => `tel:${number}`),
);

function linksAndImages({ href, src }: { href: fc.Arbitrary<string>; src: fc.Arbitrary<string> }) {
	const link = fc.tuple(href, pathSegment).map(([url, label]): Element => ({
		children: [{ type: 'text', value: label }],
		properties: { href: url, id: label },
		tagName: 'a',
		type: 'element',
	}));
	const image = fc.tuple(src, pathSegment).map(([url, alt]): Element => ({
		children: [],
		properties: { alt, src: url },
		tagName: 'img',
		type: 'element',
	}));

	return fc
		.array(fc.oneof(link, image), { maxLength: 6 })
		.map((elements) => toHtml(elements.map((element) => paragraph([element]))));
}

const anyUrls = linksAndImages({
	href: fc.oneof(rootRelativeUrl, selfContainedHref),
	src: fc.oneof(rootRelativeUrl, selfContainedSrc),
});

const text = fc.string({
	maxLength: 12,
	unit: fc.constantFrom('a', 'Z', '漢', '字', ' ', '&', '<', '>', '"'),
});

describe('prepareSyndicationHtml', () => {
	test('resolves root-relative hrefs and srcs against the site origin', () => {
		expect(prepare('<a href="/posts/a-post">A</a>')).toBe(
			'<a href="https://mtacentral.com/posts/a-post">A</a>',
		);
		expect(prepare('<img src="/media/photo.jpg" />')).toBe(
			'<img src="https://mtacentral.com/media/photo.jpg">',
		);
	});

	test('leaves absolute, protocol-relative and fragment URLs alone', () => {
		expect(
			prepare(
				'<a href="https://example.com/x">x</a><img src="//cdn.example.com/y.jpg" /><a href="#top">t</a>',
			),
		).toBe(
			'<a href="https://example.com/x">x</a><img src="//cdn.example.com/y.jpg"><a href="#top">t</a>',
		);
	});

	test('strips the scoped-style attribute Astro stamps on a styled component', () => {
		expect(prepare('<em data-astro-cid-e7hbwlr3>Rappler</em>')).toBe('<em>Rappler</em>');
		expect(prepare('<p data-astro-cid-e7hbwlr3="true">x</p>')).toBe('<p>x</p>');
	});

	test('keeps footnote ids and the links that point at them', () => {
		const footnotes =
			'<p>Text<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref="">1</a></sup></p><section data-footnotes="" class="footnotes"><ol><li id="user-content-fn-1">Note <a href="#user-content-fnref-1" data-footnote-backref="">↩</a></li></ol></section>';

		expect(prepare(footnotes)).toBe(footnotes);
	});

	test('keeps phone links', () => {
		expect(prepare('<a href="tel:+886212345678">Call</a>')).toBe(
			'<a href="tel:+886212345678">Call</a>',
		);
	});

	test('keeps figures and strips their classes', () => {
		expect(
			prepare('<figure class="wide"><img src="/a.jpg" alt=""><figcaption>A</figcaption></figure>'),
		).toBe(
			'<figure><img src="https://mtacentral.com/a.jpg" alt=""><figcaption>A</figcaption></figure>',
		);
	});

	test('resolves each srcset candidate and keeps its descriptor', () => {
		expect(prepare('<picture><source srcset="/a.webp 1x, /b.webp 2x"></picture>')).toBe(
			'<picture><source srcset="https://mtacentral.com/a.webp 1x, https://mtacentral.com/b.webp 2x"></picture>',
		);
	});

	test('reads srcset candidates without spaces and data URLs with commas', () => {
		expect(
			prepare('<picture><source srcset="/a.webp 1x,data:image/gif;base64,R0lG 2x"></picture>'),
		).toBe(
			'<picture><source srcset="https://mtacentral.com/a.webp 1x,data:image/gif;base64,R0lG 2x"></picture>',
		);
	});

	test('resolves a relative path against a site served under a base path', () => {
		expect(
			prepareSyndicationHtml('<a href="notes/">n</a>', {
				site: new URL('https://example.com/blog/'),
			}),
		).toBe('<a href="https://example.com/blog/notes/">n</a>');
	});

	test.prop([anyUrls])('no root-relative href or src survives, and none is dropped', (html) => {
		const urls = getUrls(prepare(html));

		expect(urls).toHaveLength(getUrls(html).length);
		expect(urls.filter((url) => url.startsWith('/') && !url.startsWith('//'))).toStrictEqual([]);
	});

	test.prop([anyUrls])('preparing twice changes nothing', (html) => {
		const prepared = prepare(html);

		expect(prepare(prepared)).toBe(prepared);
	});

	test.prop([linksAndImages({ href: selfContainedHref, src: selfContainedSrc })])(
		'already-absolute URLs come out unchanged',
		(html) => {
			expect(getUrls(prepare(html))).toStrictEqual(getUrls(html));
		},
	);

	test.prop([fc.array(fc.tuple(text, fc.boolean()), { maxLength: 6 })])(
		'a schema without span unwraps spans and keeps their text',
		(runs) => {
			const schema = {
				...syndicationSchema,
				tagNames: (syndicationSchema.tagNames ?? []).filter((tagName) => tagName !== 'span'),
			};

			const html = toHtml(
				paragraph(
					runs.map(([value, isWrapped]): ElementContent =>
						isWrapped
							? {
									children: [{ type: 'text', value }],
									properties: { className: ['cjk-text'] },
									tagName: 'span',
									type: 'element',
								}
							: { type: 'text', value },
					),
				),
			);

			const expected = toHtml(
				paragraph([{ type: 'text', value: runs.map(([value]) => value).join('') }]),
			);

			expect(prepareSyndicationHtml(html, { schema, site })).toBe(expected);
		},
	);
});
