import { fc, test } from '@fast-check/vitest';
import twitter from 'twitter-text';
import { describe, expect } from 'vitest';

import type { ShareKitDestination } from '../../src/destinations.js';

import { fitCaption } from '../../src/caption.js';
import {
	getDestinationUrl,
	shareKitAnywhere,
	shareKitBluesky,
	shareKitFacebook,
	shareKitInstagram,
	shareKitInstagramStory,
	shareKitLinkedin,
	shareKitMastodon,
	shareKitMessages,
	shareKitPinterest,
	shareKitReddit,
	shareKitThreads,
	shareKitX,
} from '../../src/destinations.js';
import { countLikeBluesky, countLikeMastodon } from './reference-counters.js';

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function toGraphemes(text: string) {
	return Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);
}

function isGraphemePrefix(cut: string, source: string) {
	return toGraphemes(source).slice(0, toGraphemes(cut).length).join('') === cut;
}

const builtIns: Array<ShareKitDestination<string>> = [
	shareKitAnywhere,
	shareKitBluesky,
	shareKitFacebook,
	shareKitInstagram,
	shareKitInstagramStory,
	shareKitLinkedin,
	shareKitMastodon,
	shareKitMessages,
	shareKitPinterest,
	shareKitReddit,
	shareKitThreads,
	shareKitX,
];

const limited = builtIns.filter((destination) => destination.limit !== undefined);

// Real words, since segmenters and twitter-text both behave differently on random code points
// Emoji predate 2020: twitter-text pins an old emoji table and would charge newer ones per code point
const words = {
	emoji: ['😀', '👍🏽', '👨‍👩‍👧', '🇹🇼', '❤️'],
	japanese: ['灯台', '猫', 'の', '霧', 'でした'],
	latin: ['lighthouse', 'keeper', 'in', 'fog', 'built', '1898', 'café', 'tide'],
	thai: ['ประภาคาร', 'ทะเล', 'ที่', 'เรือใบ', 'สวยงาม'],
	vietnamese: ['Hải', 'đăng', 'biển', 'thuyền', 'sóng', 'được', 'xây', 'dựng', 'thế', 'kỷ'],
	vietnameseDecomposed: ['được', 'dựng', 'kỷ', 'thuyền'].map((word) => word.normalize('NFD')),
	zh: ['燈塔', '守塔人', '是', '海港', '僅存', '的', '霧夜'],
} as const;

const spacedScripts = ['emoji', 'latin', 'vietnamese', 'vietnameseDecomposed'] as const;

const unspacedScripts = ['japanese', 'thai', 'zh'] as const;

const sentenceArbitrary = fc.oneof(
	...spacedScripts.map((script) =>
		fc
			.array(fc.constantFrom(...words[script], ...words.emoji), { maxLength: 14, minLength: 1 })
			.map((sentence) => `${sentence.join(' ')}.`),
	),
	...unspacedScripts.map((script) =>
		fc
			.array(fc.constantFrom(...words[script]), { maxLength: 14, minLength: 1 })
			.map((sentence) => `${sentence.join('')}。`),
	),
);

const titleArbitrary = fc.oneof(
	...[...spacedScripts, ...unspacedScripts].map((script) =>
		fc
			.array(fc.constantFrom(...words[script]), { maxLength: 30, minLength: 1 })
			.map((title) => title.join(script === 'thai' || script === 'zh' ? '' : ' ')),
	),
);

const descriptionArbitrary = fc.option(
	fc
		.array(sentenceArbitrary, { maxLength: 12, minLength: 1 })
		.map((sentences) => sentences.join(' ')),
	{ nil: undefined },
);

const urlArbitrary = fc
	.tuple(
		fc.array(fc.stringMatching(/^[\da-z-]{1,20}$/u), { maxLength: 6, minLength: 1 }),
		fc.constantFrom('', '?utm_medium=share&utm_source=bluesky'),
	)
	.map(([segments, query]) => `https://example.com/${segments.join('/')}/${query}`);

const fieldsArbitrary = fc.record({
	description: descriptionArbitrary,
	title: titleArbitrary,
	url: urlArbitrary,
});

describe('fitCaption', () => {
	test.prop([fieldsArbitrary, fc.constantFrom(...limited)])(
		'stays inside the limit',
		(fields, destination) => {
			const { limit, text } = fitCaption(fields, destination);

			expect(destination.count(text)).toBeLessThanOrEqual(limit ?? Infinity);
		},
	);

	test.prop([fieldsArbitrary])('X accepts every caption fitted for it', (fields) => {
		const { count, text } = fitCaption(fields, shareKitX);
		const parsed = twitter.parseTweet(text);

		expect(parsed.valid).toBe(true);
		expect(count).toBeGreaterThanOrEqual(parsed.weightedLength);
	});

	test.prop([fieldsArbitrary])(
		"Bluesky's composer counts every caption as the dialog does",
		(fields) => {
			const { count, text } = fitCaption(fields, shareKitBluesky);

			expect(count).toBe(countLikeBluesky(text));
		},
	);

	test.prop([fieldsArbitrary])(
		"Mastodon's composer counts every caption as the dialog does",
		(fields) => {
			const { count, text } = fitCaption(fields, shareKitMastodon);

			expect(count).toBe(countLikeMastodon(text));
		},
	);

	test.prop([fieldsArbitrary, fc.constantFrom(...builtIns)])(
		'keeps the link whole, once, at the end',
		(fields, destination) => {
			const { text } = fitCaption(fields, destination);
			const { shape } = destination;

			if (shape === 'full' || shape === 'url') {
				expect(text.endsWith(fields.url)).toBe(true);
				expect(text.split(fields.url)).toHaveLength(2);
			} else {
				expect(text).not.toContain('https://');
			}
		},
	);

	test.prop([fieldsArbitrary, fc.constantFrom(...limited)])(
		'keeps each part a grapheme-aligned prefix of its source, in order',
		(fields, destination) => {
			const { text } = fitCaption(fields, destination);
			const sources = [fields.title, fields.description?.trim(), fields.url].filter(
				(source): source is string => Boolean(source),
			);
			let next = 0;

			for (const part of text.split('\n\n')) {
				const cut = part.endsWith('…') ? part.slice(0, -1) : part;
				const index = sources.findIndex(
					(source, position) => position >= next && isGraphemePrefix(cut, source),
				);

				expect(index).toBeGreaterThanOrEqual(next);
				next = index + 1;
			}
		},
	);

	test('falls back to the default segmenter for a malformed locale', () => {
		const { count, limit } = fitCaption(
			{ description: 'A sentence. '.repeat(60), title: 'Title', url: 'https://example.com/' },
			shareKitX,
			'en_US',
		);

		expect(count).toBeLessThanOrEqual(limit ?? Infinity);
	});

	test('prefers a whole sentence to a cut one', () => {
		const { text } = fitCaption(
			{
				description: `${'An opening sentence about the lighthouse. '.repeat(5)}A final sentence that will not fit at all.`,
				title: "The Lighthouse Keeper's Cat",
				url: 'https://example.com/lighthouse-keepers-cat/',
			},
			shareKitX,
		);

		expect(text).toMatch(/lighthouse\.\n\nhttps:\/\/example\.com\/lighthouse-keepers-cat\/$/u);
		expect(text).not.toContain('…');
	});

	test('cuts Thai at a word, where no spaces mark one', () => {
		const description = 'เรือใบลำเล็กแล่นผ่านประภาคารริมทะเล'.repeat(12);
		const { text } = fitCaption(
			{ description, title: 'ประภาคาร', url: 'https://example.com/' },
			shareKitX,
		);
		const cut = text.split('\n\n', 2)[1]?.replace('…', '') ?? '';
		const wordEnds = new Set(
			Array.from(
				new Intl.Segmenter('th', { granularity: 'word' }).segment(description),
				({ index, segment }) => index + segment.length,
			),
		);

		expect(cut.length).toBeGreaterThan(0);
		expect(wordEnds).toContain(cut.length);
	});
});

describe('built-in counters', () => {
	test.each([
		['plain Latin', 'lighthouse', 10],
		['CJK weighs double', '燈塔海港', 8],
		['Thai is charged per code point, marks included', 'ที่', 3],
		['Vietnamese outside Latin Extended-B weighs double', 'ệ', 2],
		['decomposed Vietnamese composes first', 'ệ'.normalize('NFD'), 2],
		['an emoji sequence is one emoji', '👨‍👩‍👧', 2],
		['any link is 23', 'https://example.com/a/very/long/path/that/goes/on/and/on/', 23],
		['punctuation after a link is not part of it', 'https://example.com/a.', 24],
	])('X: %s', (_label, text, expected) => {
		expect(shareKitX.count(text)).toBe(expected);
		expect(twitter.parseTweet(text).weightedLength).toBe(expected);
	});

	test.each([
		['a short path is kept', 'https://example.com/tide-pools/', 23],
		[
			'a long path is cut to 13 and an ellipsis',
			'https://example.com/the-lighthouse-keepers-cat/',
			27,
		],
		['an emoji sequence is one grapheme', '👨‍👩‍👧 燈塔', 4],
	])('Bluesky: %s', (_label, text, expected) => {
		expect(shareKitBluesky.count(text)).toBe(expected);
		expect(countLikeBluesky(text)).toBe(expected);
	});

	test.each([
		['any link is 23', 'https://example.com/lighthouse-keepers-cat/', 23],
		['Thai marks count apart, as the web composer counts them', 'ที่', 3],
		['Latin combining marks fold into their letter', 'ệ'.normalize('NFD'), 1],
		['an emoji sequence is one', '👨‍👩‍👧‍👦 👍🏽 🇹🇼 ❤️', 7],
	])('Mastodon: %s', (_label, text, expected) => {
		expect(shareKitMastodon.count(text)).toBe(expected);
		expect(countLikeMastodon(text)).toBe(expected);
	});
});

describe('destination links', () => {
	test('tags a link bound for a destination and leaves the rest of it alone', () => {
		expect(getDestinationUrl('https://example.com/a/?page=2#share', shareKitBluesky, 'share')).toBe(
			'https://example.com/a/?page=2&utm_medium=share&utm_source=bluesky#share',
		);
	});

	test('leaves a link bare without a medium, or with nowhere in particular to go', () => {
		expect(getDestinationUrl('https://example.com/a/', shareKitBluesky, undefined)).toBe(
			'https://example.com/a/',
		);
		expect(getDestinationUrl('https://example.com/a/', shareKitAnywhere, 'share')).toBe(
			'https://example.com/a/',
		);
	});

	test('tags a host-chosen source in place of the id', () => {
		expect(
			getDestinationUrl('https://example.com/a/', { id: 'line', utmSource: 'line-app' }, 'share'),
		).toBe('https://example.com/a/?utm_medium=share&utm_source=line-app');
	});
});
