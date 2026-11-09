import { fc, test } from '@fast-check/vitest';
import { afterEach, describe, expect, vi } from 'vitest';

import type { SyndicationItem, SyndicationPublication } from '../src/index.js';

import { getRssResponse } from '../src/rss.js';

const dateCreated = new Date('2026-10-01T16:00:00Z');
const dateUpdated = new Date('2026-10-29T16:00:00Z');

const itemFull = {
	contentHtml: '<p>Body</p>',
	dateCreated,
	dateUpdated,
	description: 'After dark on Shanhang Street.',
	image: {
		alt: 'Lanterns & incense <at dusk>',
		height: 800,
		type: 'image/jpeg',
		url: 'https://img.example.com/taiwan/lukang-wuze-temple-1-1200x800.jpg',
		width: 1200,
	},
	tags: ['Temple Culture in Taiwan', 'Lukang', 'Changhua', 'Taiwan'],
	title: 'Lukang Wuze Temple (鹿港杉行街武澤宮)',
	url: 'https://example.com/lukang-wuze-temple/',
} satisfies SyndicationItem;

const itemBare = {
	dateCreated,
	tags: [],
	title: 'Bare Entry',
	url: 'https://example.com/bare-entry/',
} satisfies SyndicationItem;

const publication = {
	description: 'Fixture feed',
	language: 'en-us',
	site: new URL('https://example.com/'),
	title: 'Fixture',
} satisfies SyndicationPublication;

const selfUrl = 'https://example.com/rss.xml';

async function renderFeed(
	items: Array<SyndicationItem>,
	overrides: Partial<SyndicationPublication> = {},
) {
	const response = await getRssResponse({
		items,
		publication: { ...publication, ...overrides },
		selfUrl,
	});

	return response.text();
}

async function renderItem(item: SyndicationItem) {
	const xml = await renderFeed([item]);

	return /<item>[\s\S]*<\/item>/.exec(xml)?.[0] ?? '';
}

function getChannelTag(xml: string, tagName: string) {
	return new RegExp(`<${tagName}>([^<]*)</${tagName}>`).exec(xml)?.[1];
}

describe('getRssResponse items', () => {
	test('tags become categories in order', async () => {
		const item = await renderItem(itemFull);

		expect(
			[...item.matchAll(/<category>([^<]*)<\/category>/g)].map(([, tag]) => tag),
		).toStrictEqual(itemFull.tags);
	});

	test('the image becomes media content carrying its type, dimensions and escaped alt', async () => {
		const item = await renderItem(itemFull);

		expect(item).toContain(
			`<media:content url="${itemFull.image.url}" medium="image" type="image/jpeg" width="1200" height="800">`,
		);
		expect(item).toContain(
			'<media:description type="plain">Lanterns &amp; incense &lt;at dusk&gt;</media:description>',
		);
	});

	test('an image with no alt carries no description', async () => {
		const item = await renderItem({ ...itemFull, image: { ...itemFull.image, alt: '' } });

		expect(item).toContain('<media:content ');
		expect(item).not.toContain('<media:description');
	});

	test('an item without an image or tags emits neither', async () => {
		const item = await renderItem(itemBare);

		expect(item).not.toContain('<media:content');
		expect(item).not.toContain('<category>');
	});

	test('the publication date is the update when there is one', async () => {
		expect(await renderItem(itemFull)).toContain(`<pubDate>${dateUpdated.toUTCString()}</pubDate>`);
		expect(await renderItem(itemBare)).toContain(`<pubDate>${dateCreated.toUTCString()}</pubDate>`);
	});

	test('a root-relative image url resolves against the site', async () => {
		const item = await renderItem({
			...itemFull,
			image: { ...itemFull.image, url: '/_astro/lukang.hash.jpg' },
		});

		expect(item).toContain('<media:content url="https://example.com/_astro/lukang.hash.jpg"');
	});

	test('each author becomes an escaped creator in order', async () => {
		const item = await renderItem({
			...itemFull,
			authors: [{ name: 'Lin & Chen' }, { name: 'Wu', url: 'https://example.com/wu/' }],
		});

		expect(
			[...item.matchAll(/<dc:creator>([^<]*)<\/dc:creator>/g)].map(([, name]) => name),
		).toStrictEqual(['Lin &amp; Chen', 'Wu']);
		expect(item).toContain('<media:content ');
	});

	test('the absolute url is both link and guid', async () => {
		const item = await renderItem(itemBare);

		expect(item).toContain(`<link>${itemBare.url}</link>`);
		expect(item).toContain(`<guid isPermaLink="true">${itemBare.url}</guid>`);
	});
});

const itemDate = fc.date({
	max: new Date('2100-01-01T00:00:00Z'),
	min: new Date('1970-01-01T00:00:00Z'),
	noInvalidDate: true,
});

const datedItem = fc
	.tuple(itemDate, fc.option(itemDate, { nil: undefined }))
	.map(([created, updated]): SyndicationItem => ({
		...itemBare,
		dateCreated: created,
		...(updated ? { dateUpdated: updated } : {}),
	}));

describe('getRssResponse channel', () => {
	test.prop([fc.array(datedItem, { maxLength: 8, minLength: 1 })])(
		'the last build date is the newest item date in any item order',
		async (items) => {
			const newest = Math.max(
				...items.map((item) => (item.dateUpdated ?? item.dateCreated).getTime()),
			);

			expect(getChannelTag(await renderFeed(items), 'lastBuildDate')).toBe(
				new Date(newest).toUTCString(),
			);
		},
	);

	test('an empty feed has no last build date', async () => {
		expect(await renderFeed([])).not.toContain('<lastBuildDate>');
	});

	test('the media namespace is declared only when some item has an image', async () => {
		expect(await renderFeed([itemBare])).not.toContain('xmlns:media');
		expect(await renderFeed([itemBare, itemFull])).toContain(
			'xmlns:media="http://search.yahoo.com/mrss/"',
		);
	});

	test('the Dublin Core namespace is declared only when some item has an author', async () => {
		expect(await renderFeed([itemBare, { ...itemBare, authors: [] }])).not.toContain('xmlns:dc');
		expect(await renderFeed([itemBare, { ...itemBare, authors: [{ name: 'Wu' }] }])).toContain(
			'xmlns:dc="http://purl.org/dc/elements/1.1/"',
		);
	});

	test('the channel carries its language and self link', async () => {
		const xml = await renderFeed([itemBare]);

		expect(getChannelTag(xml, 'language')).toBe('en-us');
		expect(xml).toContain(`<atom:link href="${selfUrl}" rel="self" type="application/rss+xml"/>`);
		expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
	});

	test('a copyright with an ampersand stays well-formed', async () => {
		const xml = await renderFeed([itemBare], { copyright: '© 2026 Lanterns & Incense <Press>' });

		expect(getChannelTag(xml, 'copyright')).toBe('© 2026 Lanterns &amp; Incense &lt;Press&gt;');
	});

	test('a publication without a copyright emits none', async () => {
		expect(await renderFeed([itemBare])).not.toContain('<copyright>');
	});

	test('a missing site throws a message naming the config', async () => {
		await expect(renderFeed([itemBare], { site: undefined })).rejects.toThrow(
			'needs `site` set in the Astro config',
		);
	});
});

function getChannelImage(xml: string) {
	return /<image>[\s\S]*<\/image>/.exec(xml)?.[0];
}

describe('getRssResponse channel image', () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	afterEach(() => {
		warn.mockClear();
	});

	test('carries a resolved url plus the channel title and link', async () => {
		const xml = await renderFeed([itemBare], {
			image: { height: 144, url: '/logo.png', width: 144 },
			title: 'Lanterns & Incense',
		});

		expect(getChannelImage(xml)).toBe(
			'<image><url>https://example.com/logo.png</url><title>Lanterns &amp; Incense</title><link>https://example.com/</link><width>144</width><height>144</height></image>',
		);
		expect(warn).not.toHaveBeenCalled();
	});

	test('leaves out dimensions it is not given', async () => {
		const image = getChannelImage(
			await renderFeed([], { image: { url: 'https://cdn.example.com/a.gif' } }),
		);

		expect(image).toContain('<url>https://cdn.example.com/a.gif</url>');
		expect(image).not.toContain('<width>');
		expect(image).not.toContain('<height>');
	});

	test('a publication without an image emits none', async () => {
		expect(getChannelImage(await renderFeed([itemBare]))).toBeUndefined();
	});

	test('warns about each way an image breaks the spec', async () => {
		await renderFeed([], { image: { height: 401, url: '/logo.svg?v=2', width: 180 } });

		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0]?.[0]).toMatch(/width 180 .*; .*height 401 .*; .*SVG/);
	});

	test('warns about an SVG data URL', async () => {
		await renderFeed([], { image: { url: 'data:image/svg+xml;base64,PHN2Zy8+' } });

		expect(warn.mock.calls[0]?.[0]).toContain('SVG');
	});
});
