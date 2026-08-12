# @xsynaptic/remark-prose-rules

## 0.1.0

### Minor Changes

- Add `@xsynaptic/remark-prose-rules`, a remark plugin porting three textlint rules into the remark pipeline: `words` (diacritics), `terms` (terminology) and `patterns` (raw regex). Each match reports a vfile message carrying `expected`, so a language server can offer a quickfix.

  `words` and `patterns` rewrite the tree; `terms` reports only, unless the processor carries `data('editorialFixes', true)`.
