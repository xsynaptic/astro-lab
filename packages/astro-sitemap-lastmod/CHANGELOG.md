# @xsynaptic/astro-sitemap-lastmod

## 0.2.0

### Minor Changes

- Breaking: `wrap` passes the whole collection and accepts an async callback, a URL with no recorded date gets no `lastmod` instead of a fallback, and the file drops `generatedAt`. Adds `createCommitDateReader` to `./write`, dating entries by their last git commit.

## 0.1.0

### Minor Changes

- Initial release
