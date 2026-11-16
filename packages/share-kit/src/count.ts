const urlPattern = /https?:\/\/[\w!#$%&'()*+,./:;=?@~-]+/giu;

const urlTrailingPunctuation = /[!'),.:;?]+$/u;

const graphemeSegmenter = new Intl.Segmenter(undefined, {
	granularity: 'grapheme',
});

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

export function shareKitCountWeighted(text: string) {
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

// Mirrors stringz, Mastodon's web composer counter: an emoji sequence is one, Latin combining marks are free, Thai marks count apart
export function shareKitCountStringz(text: string) {
	let total = 0;

	for (const grapheme of getGraphemes(text)) {
		if (emojiPattern?.test(grapheme)) {
			total += 1;
			continue;
		}

		for (const character of grapheme) {
			if (!isLatinCombiningMark(character.codePointAt(0) ?? 0)) total += 1;
		}
	}

	return total;
}

// Mirrors `toShortUrl` in bluesky-social/social-app, which the composer applies before it counts
export function shareKitShortenedLinkCost(url: string) {
	if (!URL.canParse(url)) return getGraphemes(url).length;

	const { hash, host, pathname, search } = new URL(url);
	const path = `${pathname === '/' ? '' : pathname}${search}${hash}`;

	return host.length + Math.min(path.length, 16);
}

export function shareKitCountLength(text: string) {
	return text.length;
}

export function shareKitCountGraphemes(text: string) {
	return getGraphemes(text).length;
}

export function shareKitCountUtf8(text: string) {
	return utf8Encoder.encode(text).length;
}

function splitLinks(text: string) {
	const links: Array<string> = [];

	const rest = text.replaceAll(urlPattern, (match) => {
		const trailing = urlTrailingPunctuation.exec(match)?.[0] ?? '';

		links.push(match.slice(0, match.length - trailing.length));

		return trailing;
	});

	return { links, rest };
}

export type ShareKitCounter = (text: string) => number;

export function shareKitWithLinkCost(
	count: ShareKitCounter,
	cost: ((link: string) => number) | number,
): ShareKitCounter {
	return (text) => {
		const { links, rest } = splitLinks(text);
		let total = count(rest);

		for (const link of links) total += typeof cost === 'number' ? cost : cost(link);

		return total;
	};
}
