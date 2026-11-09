import type { RSSFeedItem } from '@astrojs/rss';

import rss from '@astrojs/rss';

import type { SyndicationImage, SyndicationItem, SyndicationPublication } from './index.js';

const atomNamespace = 'http://www.w3.org/2005/Atom';

// eslint-disable-next-line unicorn/prefer-https -- a namespace URI is an identifier; MRSS declares this one over http
const mediaNamespace = 'http://search.yahoo.com/mrss/';

function escapeXml(text: string) {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function getItemDate(item: SyndicationItem) {
	return item.dateUpdated ?? item.dateCreated;
}

// Not `enclosure`, which carries no dimensions and which some aggregators download automatically
function getMediaContent({ alt, height, type, url, width }: SyndicationImage) {
	const attributes = `url="${escapeXml(url)}" medium="image" type="${escapeXml(type)}" width="${String(width)}" height="${String(height)}"`;

	if (alt === '') return `<media:content ${attributes}/>`;

	return `<media:content ${attributes}><media:description type="plain">${escapeXml(alt)}</media:description></media:content>`;
}

function getRssItem(item: SyndicationItem) {
	return {
		categories: item.tags,
		link: item.url,
		pubDate: getItemDate(item),
		title: item.title,
		...(item.contentHtml ? { content: item.contentHtml } : {}),
		...(item.description ? { description: item.description } : {}),
		...(item.image ? { customData: getMediaContent(item.image) } : {}),
	} satisfies RSSFeedItem;
}

// The newest item rather than the build time, so an unchanged feed keeps its ETag across rebuilds
function getLastBuildDate(items: Array<SyndicationItem>) {
	let lastBuildDate: Date | undefined;

	for (const item of items) {
		const date = getItemDate(item);

		if (!lastBuildDate || date > lastBuildDate) lastBuildDate = date;
	}

	return lastBuildDate;
}

function getChannelData(
	{ copyright, language }: SyndicationPublication,
	{ lastBuildDate, selfUrl }: { lastBuildDate: Date | undefined; selfUrl: string | URL },
) {
	return [
		`<language>${escapeXml(language)}</language>`,
		`<atom:link href="${escapeXml(String(selfUrl))}" rel="self" type="application/rss+xml"/>`,
		...(lastBuildDate ? [`<lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>`] : []),
		...(copyright ? [`<copyright>${escapeXml(copyright)}</copyright>`] : []),
	].join('');
}

export function getRssResponse({
	items,
	publication,
	selfUrl,
}: {
	items: Array<SyndicationItem>;
	publication: SyndicationPublication;
	selfUrl: string | URL;
}) {
	if (!publication.site)
		throw new Error('astro-syndication: the RSS feed needs `site` set in the Astro config');

	return rss({
		customData: getChannelData(publication, { lastBuildDate: getLastBuildDate(items), selfUrl }),
		description: publication.description,
		items: items.map((item) => getRssItem(item)),
		site: publication.site,
		title: publication.title,
		xmlns: {
			atom: atomNamespace,
			...(items.some((item) => item.image) ? { media: mediaNamespace } : {}),
		},
	});
}
