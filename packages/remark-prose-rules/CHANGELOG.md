# @xsynaptic/remark-prose-rules

## 0.3.0

### Minor Changes

- Add a `frontmatter` option that applies rules to named yaml fields, per bucket and per field path.
- Add a `marks` option (exported default: `diacriticsMarks`) so the diacritic table is configurable, and cover `ï` plus the `naïve` family.

## 0.2.0

### Minor Changes

- Make the built-in diacritics list opt-in. It was previously always active, so `remarkProseRules()` with no options rewrote text; every option is now empty by default. Pass the list explicitly via the new `diacriticsWords` export:

  ```js
  import { diacriticsWords, remarkProseRules } from '@xsynaptic/remark-prose-rules';

  remarkProseRules({ words: diacriticsWords });
  ```

- Fix casing on multi-word diacritics corrections. Casing is now transferred per character position rather than by whole-string shape, so `Deja Vu` corrects to `Déjà Vu` instead of `déjà vu`, and an already-correct entry like `El Niño` is left alone instead of being lowercased. This affects the 43 multi-word entries in the built-in list. Drops the `match-casing` dependency.

## 0.1.0

### Minor Changes

- Add `@xsynaptic/remark-prose-rules`, a remark plugin porting three textlint rules into the remark pipeline: `words` (diacritics), `terms` (terminology) and `patterns` (raw regex). Each match reports a vfile message carrying `expected`, so a language server can offer a quickfix.

  `words` and `patterns` rewrite the tree; `terms` reports only, unless the processor carries `data('editorialFixes', true)`.
