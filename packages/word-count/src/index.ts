/**
 * Multilingual word counter using a bitmap approach
 * Derived from alfaaz (https://github.com/thecodrr/alfaaz) by Abdullah Atta, MIT License
 *
 * Uses a Uint8Array bitmap to map Unicode codepoints to word boundaries
 * Each bit represents whether a codepoint is a word separator, reducing
 * memory from 205.7KB to 25.7KB (1 bit per codepoint instead of 1 byte)
 */
import { UNICODE_RANGES } from './unicode-ranges.js';

const maxCodePoint = 205_743;
const byteSize = 8;

function buildBitmap(): Uint8Array {
	const bitmap = new Uint8Array(maxCodePoint / byteSize + 1);

	function insertCharsIntoBitmap(...chars: Array<string>) {
		for (const char of chars) {
			const charCode = char.codePointAt(0) ?? 0;
			const byteIndex = Math.floor(charCode / byteSize);
			const bitIndex = charCode % byteSize;

			bitmap[byteIndex] = (bitmap[byteIndex] ?? 0) ^ (1 << bitIndex);
		}
	}

	function insertRangeIntoBitmap(from: number, to: number) {
		for (let index = from / byteSize; index < Math.ceil(to / byteSize); index++) {
			bitmap[index] = 0b1111_1111;
		}
	}

	// Word boundary characters
	insertCharsIntoBitmap(
		' ',
		'\n',
		'\t',
		'\v',
		'*',
		'/',
		'&',
		':',
		';',
		'.',
		',',
		'?',
		'=',
		'\u{F0B}', // Tibetan mark intersyllabic tsheg (signals end of syllable)
		'\u{1361}', // Ethiopic wordspace (indicates word boundaries)
		'\u{200B}', // Zero-width space (can also be a word boundary)
	);

	// Unicode language ranges where each character is a word/syllable
	for (const range of UNICODE_RANGES) {
		insertRangeIntoBitmap(range[0], range[1]);
	}

	return bitmap;
}

const bitmap = buildBitmap();

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
	let shouldCount = false;

	for (let index = 0; index < str.length;) {
		const charCode = str.codePointAt(index) ?? 0;
		const byteIndex = Math.floor(charCode / byteSize);
		const bitIndex = charCode % byteSize;
		const byteAtIndex = bitmap[byteIndex] ?? 0;
		const isMatch = ((byteAtIndex >> bitIndex) & 1) === 1;

		if (isMatch) {
			// 255 means a Unicode range match (every character is its own unit)
			// A pending delimited word ends here even without a boundary, e.g. Latin glued to CJK
			if (byteAtIndex === 255) {
				if (shouldCount) words += 1;
				scriptChars += 1;
			} else if (shouldCount) {
				words += 1;
			}
			shouldCount = false;
		} else {
			shouldCount = true;
		}

		// Step by 2 for supplementary plane characters (surrogate pairs)
		index += charCode > 0xff_ff ? 2 : 1;
	}

	// Count the last word if string didn't end on a boundary
	if (shouldCount) words += 1;

	return { scriptChars, total: words + scriptChars, words };
}
