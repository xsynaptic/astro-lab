import { describe, expect, test } from 'vitest';

import { countWords, countWordsBreakdown } from '../src/index.js';

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

	test('total always equals countWords', () => {
		for (const sample of ['', 'hello', 'Hello 世界', 'ไทย', '안녕하세요 세계', '  spaced  out  ']) {
			expect(countWordsBreakdown(sample).total).toBe(countWords(sample));
		}
	});
});
