# @xsynaptic/astro-image-pipeline

## 0.2.0

### Minor Changes

- OpenGraph card images are `{ path, treatment? }` and `decode` receives the resolved `filePath`, in manifest version 5.
- Replace presets with `getSizedName`: `defineImagePipeline({ encoding })` now returns `{ encoding, getSizedName }`, and sites own their sizing.

## 0.1.0

### Minor Changes

- First release. An Astro integration that records the images each build uses, then renders them with sharp outside the bundler. OpenGraph cards render the same way.
