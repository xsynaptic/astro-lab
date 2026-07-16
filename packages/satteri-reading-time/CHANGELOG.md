# @xsynaptic/satteri-reading-time

## 0.2.0

### Minor Changes

- New package: a Sätteri mdast plugin that estimates multilingual reading time and injects it into Astro's frontmatter (surfaced as `remarkPluginFrontmatter`). Counts whitespace-delimited words and per-character scripts at separate rates via `@xsynaptic/word-count`, excludes fenced code by default, and works across MDX components.

### Patch Changes

- Updated dependencies
  - @xsynaptic/word-count@0.2.0
