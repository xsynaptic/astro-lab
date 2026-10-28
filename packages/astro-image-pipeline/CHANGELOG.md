# @xsynaptic/astro-image-pipeline

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
