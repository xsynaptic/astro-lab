# @xsynaptic/word-count

A fast, dependency-free word counter with multilingual support. It handles whitespace-delimited scripts (Latin, Cyrillic, and so on) and scriptio-continua scripts where characters or syllables are themselves words: Chinese, Japanese, Korean, Thai, Lao, Burmese, Khmer, Javanese, and Vai.

Counting uses a `Uint8Array` lookup table with two bits per codepoint, about 51KB. Each codepoint is a word character, a separator, a per-character script unit, or punctuation that holds a word together. The whitespace and punctuation classes come from the JavaScript engine's own Unicode data.

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

Any Unicode space separates words, including no-break and ideographic spaces. Punctuation never counts as a word on its own. Apostrophes, hyphens and underscores keep a word together (`don't`, `well-known`, `snake_case`); any other punctuation splits it, so `iPhone、iPad` is two words, `你好，世界。` is four, and a lone `—` is none.

### `countWordsBreakdown(input: string): { words, scriptChars, total }`

Same count as `countWords`, split by how each unit was counted: `words` are whitespace-delimited (Latin, Korean, Cyrillic, …), `scriptChars` are per-character-script units (CJK, Japanese kana, Thai, Lao, Burmese, Khmer, Javanese, Vai), and `total` equals `words + scriptChars`. Use this when the two classes need different treatment, such as separate reading-speed rates.

## Acknowledgements

The idea of a precomputed per-codepoint lookup table, and the Unicode range tables, come from [alfaaz][] by Abdullah Atta, used under the MIT License. See [LICENSE](./LICENSE) for the full notice.

## License

[MIT][mit-license]

[alfaaz]: https://github.com/thecodrr/alfaaz
[mit-license]: https://opensource.org/licenses/MIT
