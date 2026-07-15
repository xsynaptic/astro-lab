# @xsynaptic/astro-image-loader

## 0.1.2

### Patch Changes

- Fix crash when `base` is an absolute path. Entry and cache paths are now always root-relative, so the store no longer rejects them.

## 0.1.1

### Patch Changes

- JSONL cache hardening: a failed initial read degrades to an empty cache (with a warning) instead of poisoning every later call; prune skips the full-file rewrite when the file already mirrors live entries; the prune calling contract (at most once per load, no concurrent sets) is now documented on the cache interface

## 0.1.0

### Minor Changes

- Add `@xsynaptic/astro-image-loader`, an Astro content layer loader that treats images as content entries. It owns glob discovery, digest-based incremental sync, watch-mode updates through a serialized debounced queue, and a swappable dataHandler-output cache (JSONL by default, `{ get, set, prune? }` interface, `false` to disable). Metadata extraction is pluggable: compose `plugins` or use the single `dataHandler` escape hatch. Ships two optional-peer plugins, `/exif` (exiftool-vendored, GPS opt-in) and `/dimensions` (sharp).
