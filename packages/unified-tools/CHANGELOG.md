# @xsynaptic/unified-tools

## 5.0.0

### Major Changes

- 28cd802: CJK wrapping now runs after sanitization in `wrapCjk`, `wrapChinese`, `wrapJapanese`, `wrapKorean`, and `transformMarkdown`, so the wrapper's `class` (including the default `cjk`) is preserved instead of being stripped by rehype-sanitize. The wrappers are generated from trusted options rather than the input, so adding them after sanitization is safe.

  `wrapCjk` also now requires `wrapCjkOptions`. Calling it without options previously produced no wrapping at all, so the parameter is required to make that misuse a type error.

### Patch Changes

- 28cd802: Relocate into the `astro-lab` monorepo: update repository and homepage metadata, add a LICENSE file, and standardize packaging (tsdown entry, manifest fields). No changes to the public API.
- Updated dependencies [28cd802]
- Updated dependencies [28cd802]
  - @xsynaptic/rehype-wrap-cjk@3.0.0
