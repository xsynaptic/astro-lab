import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import { countWords, countWordsBreakdown } from '../src/index.js';
import { UNICODE_RANGES } from '../src/unicode-ranges.js';

const handPickedWhitespace = [
	' ',
	'\t',
	'\n',
	'\r',
	'\v',
	'\f',
	'\u{A0}',
	'\u{2003}',
	'\u{2028}',
	'\u{202F}',
	'\u{3000}',
	'\u{FEFF}',
];

const tokenChars = ['a', 'b', 'é', 'я', '한', '中', '文', 'テ', 'ไ', '々', '-', "'", '’', '_'];
const punctuationChars = [
	'-',
	'—',
	'…',
	'!',
	'"',
	'(',
	')',
	'«',
	'»',
	'¿',
	'、',
	'。',
	'「',
	'」',
	'，',
	'！',
	'·',
	'.',
	',',
];

const nonEmptyTokens = fc.array(fc.string({ minLength: 1, unit: fc.constantFrom(...tokenChars) }), {
	maxLength: 8,
});
const punctuationOnlyToken = fc.string({
	minLength: 1,
	unit: fc.constantFrom(...punctuationChars),
});

function isInScriptRange(codePoint: number) {
	return UNICODE_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);
}

function describeCodePoint(codePoint: number) {
	const char = String.fromCodePoint(codePoint);

	if (/[\s\p{Z}=\u{200B}]/u.test(char)) return { alone: [0, 0], betweenLetters: [2, 0] };

	if (/[\p{Pc}'’\-‐‑]/u.test(char)) return { alone: [0, 0], betweenLetters: [1, 0] };

	if (/\p{P}/u.test(char)) return { alone: [0, 0], betweenLetters: [2, 0] };

	if (isInScriptRange(codePoint)) return { alone: [0, 1], betweenLetters: [2, 1] };

	return { alone: [1, 0], betweenLetters: [1, 0] };
}

function toPair({ scriptChars, words }: { scriptChars: number; words: number }) {
	return [words, scriptChars];
}

const latinToken = fc.string({
	maxLength: 4,
	minLength: 1,
	unit: fc.constantFrom('a', 'B', 'é', 'я', '한'),
});
const handPickedSeparators = [
	'、',
	'，',
	'。',
	'「',
	'—',
	'–',
	'!',
	'?',
	'(',
	')',
	'"',
	'«',
	'…',
	'/',
	':',
];
const handPickedJoiners = ["'", '’', '-', '‐', '_'];

describe('countWords', () => {
	test('returns 0 for an empty string', () => {
		expect(countWords('')).toBe(0);
	});

	test('counts a single word', () => {
		expect(countWords('hello')).toBe(1);
	});

	test('counts whitespace-delimited words', () => {
		expect(countWords('The quick brown fox')).toBe(4);
	});

	test('ignores leading, trailing, and repeated whitespace', () => {
		expect(countWords('  spaced  out  ')).toBe(2);
	});

	test('treats punctuation as a boundary, not a word', () => {
		expect(countWords('hello, world')).toBe(2);
	});

	test('counts each CJK character as its own word', () => {
		expect(countWords('中文')).toBe(2);
	});

	test('counts each Japanese kana as its own word', () => {
		expect(countWords('テスト')).toBe(3); // katakana
		expect(countWords('ひらがな')).toBe(4); // hiragana
	});

	test('counts mixed Latin and CJK text', () => {
		expect(countWords('Hello 世界')).toBe(3);
	});

	test('counts each character in a scriptio-continua script (Thai)', () => {
		expect(countWords('ไทย')).toBe(3);
	});

	test('handles supplementary-plane characters (surrogate pairs)', () => {
		const extensionB = String.fromCodePoint(0x2_00_00); // CJK Unified Ideographs Extension B
		expect(countWords(extensionB.repeat(2))).toBe(2);
	});
});

describe('countWordsBreakdown', () => {
	test('returns zeros for an empty string', () => {
		expect(countWordsBreakdown('')).toEqual({ scriptChars: 0, total: 0, words: 0 });
	});

	test('splits Latin prose into delimited words', () => {
		expect(countWordsBreakdown('The quick brown fox')).toEqual({
			scriptChars: 0,
			total: 4,
			words: 4,
		});
	});

	test('splits CJK characters into scriptChars', () => {
		expect(countWordsBreakdown('中文')).toEqual({ scriptChars: 2, total: 2, words: 0 });
	});

	test('splits mixed Latin and CJK', () => {
		expect(countWordsBreakdown('Hello 世界')).toEqual({ scriptChars: 2, total: 3, words: 1 });
	});

	test('counts a Latin word glued to a script character with no separator', () => {
		// common in CJK typography (e.g. Web开发); the pending Latin word must not be dropped
		expect(countWordsBreakdown('Web开发')).toEqual({ scriptChars: 2, total: 3, words: 1 });
	});

	test('counts Thai as per-character scriptChars, not one delimited word', () => {
		expect(countWordsBreakdown('ไทย')).toEqual({ scriptChars: 3, total: 3, words: 0 });
	});

	test('counts Korean as delimited words, not per-syllable scriptChars', () => {
		// Hangul has no per-character range, so a space-delimited sentence counts by words
		expect(countWordsBreakdown('안녕하세요 세계')).toEqual({ scriptChars: 0, total: 2, words: 2 });
	});
});

describe('punctuation and whitespace', () => {
	test('counts CJK text without its punctuation', () => {
		expect(countWords('你好、世界。')).toBe(4);
		expect(countWords('支持iOS、Android和Windows')).toBe(6);
		expect(countWordsBreakdown('人々〇')).toEqual({ scriptChars: 3, total: 3, words: 0 });
	});

	test('classifies every codepoint, alone and between two letters', () => {
		const mismatches: Array<string> = [];

		for (let codePoint = 0; codePoint <= 0x3_ff_ff; codePoint++) {
			if (codePoint >= 0xd8_00 && codePoint <= 0xdf_ff) continue;

			const char = String.fromCodePoint(codePoint);
			const expected = describeCodePoint(codePoint);
			const alone = toPair(countWordsBreakdown(char));
			const betweenLetters = toPair(countWordsBreakdown(`a${char}b`));

			if (
				alone.join(',') !== expected.alone.join(',') ||
				betweenLetters.join(',') !== expected.betweenLetters.join(',')
			) {
				mismatches.push(codePoint.toString(16));
			}
		}

		expect(mismatches).toEqual([]);
	});

	test.prop([latinToken, fc.constantFrom(...handPickedSeparators), latinToken])(
		'splits two words at separating punctuation with no space around it',
		(first, separator, second) => {
			expect(countWords(`${first}${separator}${second}`)).toBe(2);
		},
	);

	test.prop([latinToken, fc.constantFrom(...handPickedJoiners), latinToken])(
		'keeps two parts joined by an apostrophe, hyphen or underscore as one word',
		(first, joiner, second) => {
			expect(countWords(`${first}${joiner}${second}`)).toBe(1);
		},
	);

	test.prop([nonEmptyTokens, fc.array(fc.constantFrom(...handPickedWhitespace), { maxLength: 8 })])(
		'counts the same whichever whitespace separates the tokens',
		(tokens, separators) => {
			const mixed = tokens.map((token, index) => `${token}${separators[index] ?? ' '}`).join('');

			expect(countWords(mixed)).toBe(countWords(tokens.join(' ')));
		},
	);

	test.prop([nonEmptyTokens, punctuationOnlyToken, fc.nat()])(
		'adds nothing for a token made only of punctuation',
		(tokens, punctuation, position) => {
			const withPunctuation = tokens.toSpliced(position % (tokens.length + 1), 0, punctuation);

			expect(countWords(withPunctuation.join(' '))).toBe(countWords(tokens.join(' ')));
		},
	);
});
