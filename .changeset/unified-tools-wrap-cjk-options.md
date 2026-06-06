---
"@xsynaptic/unified-tools": major
---

CJK wrapping now runs after sanitization in `wrapCjk`, `wrapChinese`, `wrapJapanese`, `wrapKorean`, and `transformMarkdown`, so the wrapper's `class` (including the default `cjk`) is preserved instead of being stripped by rehype-sanitize. The wrappers are generated from trusted options rather than the input, so adding them after sanitization is safe.

`wrapCjk` also now requires `wrapCjkOptions`. Calling it without options previously produced no wrapping at all, so the parameter is required to make that misuse a type error.
