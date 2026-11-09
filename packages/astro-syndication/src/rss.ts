import type { RSSFeedItem } from '@astrojs/rss';

import rss from '@astrojs/rss';

import type {
	SyndicationAuthor,
	SyndicationImage,
	SyndicationItem,
	SyndicationPublication,
	SyndicationPublicationImage,
} from './index.js';

import { resolveUrl } from './url.js';

const atomNamespace = 'http://www.w3.org/2005/Atom';

const dublinCoreNamespace = 'http://purl.org/dc/elements/1.1/';

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
function getMediaContent({ alt, height, type, url, width }: SyndicationImage, site: URL) {
	const attributes = `url="${escapeXml(resolveUrl(url, site))}" medium="image" type="${escapeXml(type)}" width="${String(width)}" height="${String(height)}"`;

	if (alt === '') return `<media:content ${attributes}/>`;

	return `<media:content ${attributes}><media:description type="plain">${escapeXml(alt)}</media:description></media:content>`;
}

// RSS's own `author` must be an email address
function getCreator({ name }: SyndicationAuthor) {
	return `<dc:creator>${escapeXml(name)}</dc:creator>`;
}

function getItemData({ authors = [], image }: SyndicationItem, site: URL) {
	return [
		...authors.map((author) => getCreator(author)),
		image ? getMediaContent(image, site) : '',
	].join('');
}

function getRssItem(item: SyndicationItem, site: URL) {
	const customData = getItemData(item, site);

	return {
		categories: item.tags,
		link: item.url,
		pubDate: getItemDate(item),
		title: item.title,
		...(item.contentHtml ? { content: item.contentHtml } : {}),
		...(item.description ? { description: item.description } : {}),
		...(customData ? { customData } : {}),
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

const svgUrl = /^data:image\/svg\+xml[,;]|\.svg(?:[#?]|$)/i;

function warnChannelImage({ height = 0, url, width = 0 }: SyndicationPublicationImage) {
	const problems: Array<string> = [];

	if (width > 144) problems.push(`its width ${String(width)} is over 144`);
	if (height > 400) problems.push(`its height ${String(height)} is over 400`);
	if (svgUrl.test(url)) problems.push('it is an SVG, where readers expect GIF, JPEG or PNG');
	if (problems.length === 0) return;

	console.warn(
		`astro-syndication: the RSS channel image ${url} may be dropped: ${problems.join('; ')}`,
	);
}

function getChannelImage(
	{ height, url, width }: SyndicationPublicationImage,
	title: string,
	site: URL,
) {
	return [
		'<image>',
		`<url>${escapeXml(resolveUrl(url, site))}</url>`,
		`<title>${escapeXml(title)}</title>`,
		`<link>${escapeXml(site.href)}</link>`,
		...(width === undefined ? [] : [`<width>${String(width)}</width>`]),
		...(height === undefined ? [] : [`<height>${String(height)}</height>`]),
		'</image>',
	].join('');
}

function getChannelData(
	{ copyright, image, language, title }: SyndicationPublication,
	{
		lastBuildDate,
		selfUrl,
		site,
	}: { lastBuildDate: Date | undefined; selfUrl: string | URL; site: URL },
) {
	return [
		`<language>${escapeXml(language)}</language>`,
		`<atom:link href="${escapeXml(String(selfUrl))}" rel="self" type="application/rss+xml"/>`,
		...(lastBuildDate ? [`<lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>`] : []),
		...(copyright ? [`<copyright>${escapeXml(copyright)}</copyright>`] : []),
		...(image ? [getChannelImage(image, title, site)] : []),
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

	const { image, site } = publication;

	if (image) warnChannelImage(image);

	return rss({
		customData: getChannelData(publication, {
			lastBuildDate: getLastBuildDate(items),
			selfUrl,
			site,
		}),
		description: publication.description,
		items: items.map((item) => getRssItem(item, site)),
		site,
		title: publication.title,
		xmlns: {
			atom: atomNamespace,
			...(items.some((item) => item.authors?.length) ? { dc: dublinCoreNamespace } : {}),
			...(items.some((item) => item.image) ? { media: mediaNamespace } : {}),
		},
	});
}
