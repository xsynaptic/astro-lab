import { RichText, UnicodeString } from '@bsky/sdk/richtext';
import { length } from 'stringz';
import twitter from 'twitter-text';

// Mastodon's `countableText` swaps each link for 23 characters before stringz counts (compose/util/counter.ts)
export function countLikeMastodon(text: string) {
	const links = twitter.extractUrlsWithIndices(text, { extractUrlsWithoutProtocol: false });
	let countable = text;

	for (const { url } of links) countable = countable.replace(url, 'x'.repeat(23));

	return length(countable);
}

export function countLikeX(text: string) {
	return twitter.parseTweet(text).weightedLength;
}

// Copied from social-app src/lib/strings/url-helpers.ts at 7f064ab
function toShortUrl(url: string): string {
	try {
		const urlp = new URL(url);
		if (urlp.protocol !== 'http:' && urlp.protocol !== 'https:') {
			return url;
		}
		const path = (urlp.pathname === '/' ? '' : urlp.pathname) + urlp.search + urlp.hash;
		if (path.length > 15) {
			return urlp.host + path.slice(0, 13) + '...';
		}
		return urlp.host + path;
	} catch {
		return url;
	}
}

// social-app's composer counts `shortenLinks(rt).graphemeLength` (src/lib/strings/rich-text-manip.ts at 7f064ab)
export function countLikeBluesky(text: string) {
	const rt = new RichText({ text });

	rt.detectFacetsWithoutResolution();

	const facets = rt.facets ?? [];

	for (const facet of facets) {
		const isLink = facet.features.some(
			(feature) => feature.$type === 'app.bsky.richtext.facet#link',
		);

		if (!isLink) continue;

		const { byteEnd, byteStart } = facet.index;
		const url = rt.unicodeText.slice(byteStart, byteEnd);
		const shortened = new UnicodeString(toShortUrl(url));

		rt.insert(byteStart, shortened.utf16);
		facet.index.byteStart = byteStart;
		facet.index.byteEnd = byteStart + shortened.length;
		rt.delete(byteStart + shortened.length, byteEnd + shortened.length);
	}

	return rt.graphemeLength;
}
