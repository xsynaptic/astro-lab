# @xsynaptic/astro-image-loader

## 0.1.0

### Minor Changes

- Add `@xsynaptic/astro-image-loader`, an Astro content layer loader that treats images as content entries. It owns glob discovery, digest-based incremental sync, watch-mode updates through a serialized debounced queue, and a swappable dataHandler-output cache (JSONL by default, `{ get, set, prune? }` interface, `false` to disable). Metadata extraction is pluggable: compose `plugins` or use the single `dataHandler` escape hatch. Ships two optional-peer plugins, `/exif` (exiftool-vendored, GPS opt-in) and `/dimensions` (sharp).
