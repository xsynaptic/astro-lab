type ShareCounter = 'graphemes' | 'length' | 'stringz' | 'utf8' | 'weighted';

type ShareUrlCost = 'actual' | 'fixed' | 'shortened';

// X and Mastodon both charge 23 for any link, whatever its length
const urlFixedCost = 23;

const urlPattern = /https?:\/\/[\w!#$%&'()*+,./:;=?@~-]+/giu;

const urlTrailingPunctuation = /[!'),.:;?]+$/u;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const utf8Encoder = new TextEncoder();

const latinCombiningMarkRanges = [
	[0x03_00, 0x03_6f],
	[0x1a_b0, 0x1a_ff],
	[0x1d_c0, 0x1d_ff],
	[0x20_d0, 0x20_ff],
	[0xfe_20, 0xfe_2f],
] as const;

// The `v` flag is newer than `Intl.Segmenter`; without it emoji are charged per code point, which only overcounts
function getEmojiPattern() {
	try {
		return new RegExp(String.raw`^\p{RGI_Emoji}$`, 'v');
	} catch {
		return;
	}
}

const emojiPattern = getEmojiPattern();

export function getGraphemes(text: string) {
	return Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);
}

// twitter-text config v3; every code point outside these ranges weighs double
function isLightCodePoint(codePoint: number) {
	return (
		codePoint <= 0x10_ff ||
		(codePoint >= 0x20_00 && codePoint <= 0x20_0d) ||
		(codePoint >= 0x20_10 && codePoint <= 0x20_1f) ||
		(codePoint >= 0x20_32 && codePoint <= 0x20_37)
	);
}

function getWeightedLength(text: string) {
	const graphemes = getGraphemes(text.normalize('NFC'));
	let total = 0;

	for (const grapheme of graphemes) {
		if (emojiPattern?.test(grapheme)) {
			total += 2;
			continue;
		}

		for (const character of grapheme) {
			total += isLightCodePoint(character.codePointAt(0) ?? 0) ? 1 : 2;
		}
	}

	return total;
}

function isLatinCombiningMark(codePoint: number) {
	return latinCombiningMarkRanges.some(([start, end]) => codePoint >= start && codePoint <= end);
}

// Mirrors stringz, which Mastodon's web composer counts with: one per code point, except Latin combining marks; Thai marks count apart
function getStringzLength(text: string) {
	let total = 0;

	for (const character of text) {
		if (!isLatinCombiningMark(character.codePointAt(0) ?? 0)) total += 1;
	}

	return total;
}

// Mirrors `toShortUrl` in bluesky-social/social-app, which the composer applies before it counts
function getShortenedUrlLength(url: string) {
	if (!URL.canParse(url)) return getGraphemes(url).length;

	const { hash, host, pathname, search } = new URL(url);
	const path = `${pathname === '/' ? '' : pathname}${search}${hash}`;

	return host.length + Math.min(path.length, 16);
}

const textCounters = {
	graphemes: (text: string) => getGraphemes(text).length,
	length: (text: string) => text.length,
	stringz: getStringzLength,
	utf8: (text: string) => utf8Encoder.encode(text).length,
	weighted: getWeightedLength,
} as const satisfies Record<ShareCounter, (text: string) => number>;

function splitLinks(text: string) {
	const links: Array<string> = [];

	const rest = text.replaceAll(urlPattern, (match) => {
		const trailing = urlTrailingPunctuation.exec(match)?.[0] ?? '';

		links.push(match.slice(0, match.length - trailing.length));

		return trailing;
	});

	return { links, rest };
}

export interface ShareCountRule {
	counter: ShareCounter;
	urlCost: ShareUrlCost;
}

export function countText(text: string, { counter, urlCost }: ShareCountRule) {
	const count = textCounters[counter];

	if (urlCost === 'actual') return count(text);

	const { links, rest } = splitLinks(text);
	let total = count(rest);

	for (const link of links) {
		total += urlCost === 'fixed' ? urlFixedCost : getShortenedUrlLength(link);
	}

	return total;
}
