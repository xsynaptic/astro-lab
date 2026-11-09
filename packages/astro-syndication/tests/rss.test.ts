import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

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
