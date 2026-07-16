# @xsynaptic/word-count

A fast, dependency-free word counter with multilingual support. It handles whitespace-delimited scripts (Latin, Cyrillic, and so on) and scriptio-continua scripts where characters or syllables are themselves words: Chinese, Japanese, Korean, Thai, Lao, Burmese, Khmer, Javanese, and Vai.

Counting uses a `Uint8Array` bitmap that maps Unicode codepoints to word boundaries. Storing one bit per codepoint instead of one byte keeps the lookup table around 25.7KB.

_Note_: this package is ESM-only.

## Install

```sh
npm install @xsynaptic/word-count
```

## Use

```ts
import { countWords } from '@xsynaptic/word-count';

countWords('The quick brown fox'); // 4
countWords('中文 can appear anywhere'); // 5 (中, 文, can, appear, anywhere)
countWords('テスト'); // 3 (Japanese kana count per character)
countWords('สวัสดีครับ'); // counts Thai syllables, which have no spaces
```

## API

### `countWords(input: string): number`

Returns the number of words in `input`. For whitespace-delimited scripts a word is a run of non-boundary characters. For scriptio-continua scripts each in-range character counts as a word, since those scripts do not separate words with spaces.

### `countWordsBreakdown(input: string): { words, scriptChars, total }`

Same count as `countWords`, split by how each unit was counted: `words` are whitespace-delimited (Latin, Korean, Cyrillic, …), `scriptChars` are per-character-script units (CJK, Japanese kana, Thai, Lao, Burmese, Khmer, Javanese, Vai), and `total` equals `words + scriptChars`. Use this when the two classes need different treatment, such as separate reading-speed rates.

## Acknowledgements

The bitmap approach and the Unicode range tables are derived from [alfaaz][] by Abdullah Atta, used under the MIT License. See [LICENSE](./LICENSE) for the full notice.

## License

[MIT][mit-license]

[alfaaz]: https://github.com/thecodrr/alfaaz
[mit-license]: https://opensource.org/licenses/MIT
