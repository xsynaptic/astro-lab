/**
 * Multilingual word counter using a packed lookup table
 * Derived from alfaaz (https://github.com/thecodrr/alfaaz) by Abdullah Atta, MIT License
 *
 * Two bits per codepoint keep the table near 51KB
 */
import { UNICODE_RANGES } from './unicode-ranges.js';

const maxCodePoint = 205_743;
const classesPerByte = 4;

const charClass = {
	boundary: 1,
	joiner: 3,
	script: 2,
	word: 0,
} as const;

type CharClass = (typeof charClass)[keyof typeof charClass];

const boundaryChars = [
	'=',
	'\u{200B}', // Zero-width space (can also be a word boundary)
];

const whitespacePattern = /[\s\p{Z}]/u;
const punctuationPattern = /\p{P}/u;
const joinerPattern = /[\p{Pc}'’\-‐‑]/u;
const surrogates = { from: 0xd8_00, to: 0xdf_ff } as const;

function buildTable(): Uint8Array {
	const table = new Uint8Array(Math.ceil((maxCodePoint + 1) / classesPerByte));

	function setClass(codePoint: number, value: CharClass) {
		const byteIndex = Math.floor(codePoint / classesPerByte);
		const shift = (codePoint % classesPerByte) * 2;

		table[byteIndex] = ((table[byteIndex] ?? 0) & ~(0b11 << shift)) | (value << shift);
	}

	for (const [from, to] of UNICODE_RANGES) {
		for (let codePoint = from; codePoint <= to; codePoint++) setClass(codePoint, charClass.script);
	}

	for (let codePoint = 0; codePoint <= maxCodePoint; codePoint++) {
		if (codePoint >= surrogates.from && codePoint <= surrogates.to) continue;

		const char = String.fromCodePoint(codePoint);

		if (whitespacePattern.test(char)) setClass(codePoint, charClass.boundary);
		else if (joinerPattern.test(char)) setClass(codePoint, charClass.joiner);
		else if (punctuationPattern.test(char)) setClass(codePoint, charClass.boundary);
	}

	for (const char of boundaryChars) setClass(char.codePointAt(0) ?? 0, charClass.boundary);

	return table;
}

const table = buildTable();

function classOf(codePoint: number): CharClass {
	const byte = table[Math.floor(codePoint / classesPerByte)] ?? 0;

	return ((byte >> ((codePoint % classesPerByte) * 2)) & 0b11) as CharClass;
}

/** Split word count for callers that need per-script-class rates (e.g. reading time). */
export interface WordCountBreakdown {
	// Per-character-script units: CJK, Japanese kana, Thai, Lao, Burmese, Khmer, Javanese, Vai
	scriptChars: number;
	// words + scriptChars; identical to countWords for the same input
	total: number;
	// Whitespace-delimited words: Latin, Korean, Cyrillic, and any script not in UNICODE_RANGES
	words: number;
}

/**
 * Count words in a string with multilingual support
 * Handles Latin scripts (whitespace-delimited) and CJK/Japanese kana/Thai/Lao/Burmese/Khmer/Javanese/Vai
 */
export function countWords(str: string): number {
	return countWordsBreakdown(str).total;
}

/**
 * Like countWords, but split into whitespace-delimited `words` and per-character `scriptChars`
 * `total` equals countWords for the same input
 */
export function countWordsBreakdown(str: string): WordCountBreakdown {
	let words = 0;
	let scriptChars = 0;
	let isInWord = false;

	for (let index = 0; index < str.length;) {
		const codePoint = str.codePointAt(index) ?? 0;
		const value = classOf(codePoint);

		// A pending delimited word ends here even without a boundary, e.g. Latin glued to CJK
		if (value === charClass.boundary || value === charClass.script) {
			if (isInWord) words += 1;
			if (value === charClass.script) scriptChars += 1;
			isInWord = false;
		} else if (value === charClass.word) {
			isInWord = true;
		}

		// Step by 2 for supplementary plane characters (surrogate pairs)
		index += codePoint > 0xff_ff ? 2 : 1;
	}

	if (isInWord) words += 1;

	return { scriptChars, total: words + scriptChars, words };
}
