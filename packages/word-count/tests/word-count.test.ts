import { describe, expect, test } from 'vitest';

import { countWords } from '../src/index.js';

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
