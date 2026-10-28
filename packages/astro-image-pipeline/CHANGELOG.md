# @xsynaptic/astro-image-pipeline

## 0.8.0

### Minor Changes

- The prepared OpenGraph card render lists its `cards`, and each `missingImages` entry is `{ path, cards }`.

## 0.7.0

### Minor Changes

- `getPlaceholder(source, { pixels?, size? })` validates both and names the image; `PlaceholderSize` is now `ImagePlaceholderRequest` and `PlaceholderRecipe` is now `ImagePlaceholderRecipe`. Delete `<cachePath>/placeholders.sqlite`.

## 0.6.0

### Minor Changes

- Add the `placeholders` option (`mosaic` or `blur` recipes) and `getPlaceholder` in `./node`, cached in `<cachePath>/placeholders.sqlite`.

## 0.5.0

### Minor Changes

- `baseUrl` is optional, for a site that only renders OpenGraph cards; `prepareOpenGraphCardRender` takes `missingImage: 'omit'` and returns `missingImages`; prepared renders and sweeps carry their output `directory` and export their result types; image runs take `concurrency`; add `createDirectorySources` to the root entry and `listImageSources` and `hashTemplateVersion` to `./node`.

## 0.4.1

### Patch Changes

- A sweep keeps the manifest of a build that lands mid-sweep, and `run()` returns `keep`.

## 0.4.0

### Minor Changes

- `prepareImageSweep` deletes renditions no kept build references, `findDistManifest` returns `undefined` when dist has no build, and `ImageEncoding` moves from `./names` to the root entry.

## 0.3.0

### Minor Changes

- `./presets` is now `./names` with direct `getSizedName`, `getCardName` and `fitWithinSource`; the integration takes `encoding`; each build keeps its own manifest, and renders are `prepare*Render({ cachePath, distPath }).run()`.

## 0.2.0

### Minor Changes

- OpenGraph card images are `{ path, treatment? }` and `decode` receives the resolved `filePath`, in manifest version 5.
- Replace presets with `getSizedName`: `defineImagePipeline({ encoding })` now returns `{ encoding, getSizedName }`, and sites own their sizing.

## 0.1.0

### Minor Changes

- First release. An Astro integration that records the images each build uses, then renders them with sharp outside the bundler. OpenGraph cards render the same way.
