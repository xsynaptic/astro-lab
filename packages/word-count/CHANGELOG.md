# @xsynaptic/word-count

## 0.2.0

### Minor Changes

- Add `countWordsBreakdown`, which returns the count split into whitespace-delimited `words` and per-character-script `scriptChars` (`total` matches `countWords`). Also count Japanese hiragana and katakana per character; previously kana runs were counted as a single word, undercounting Japanese text.

  Fix a word undercount when a whitespace-delimited word is glued directly to a per-character script character with no separator (e.g. `Web开发`): the pending word was dropped. This slightly increases counts for such mixed no-space content, in both `countWords` and `countWordsBreakdown`.

## 0.1.0

### Minor Changes

- Initial release. A fast, dependency-free multilingual word counter using a Uint8Array codepoint bitmap, with support for CJK, Thai, Lao, Burmese, Khmer, Javanese, and Vai scripts. Relocated into the `astro-lab` monorepo from a private workspace package.
