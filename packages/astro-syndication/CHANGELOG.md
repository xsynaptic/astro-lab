# @xsynaptic/astro-syndication

## 0.2.0

### Minor Changes

- Add item `authors`, a publication `image` and `toSyndicationImage`; resolve image URLs against `site`; `anchorDateOnly` shifts only values at midnight UTC

### Patch Changes

- Load as an SSR external, so Node resolves its HTML parsing dependencies from the package rather than from the consuming project, which may pin a different major of `entities`

## 0.1.0

### Minor Changes

- Initial release
