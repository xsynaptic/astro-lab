# @xsynaptic/astro-build-logger

## 0.2.0

### Minor Changes

- Widen the `astro` peer dependency to `^6.0.0 || ^7.0.0-beta.0` so the integration formally supports Astro 7 (including the current 7.0 prereleases) alongside Astro 6. The `astro:build:start` and `astro:build:done` hooks it relies on are unchanged across both majors, so no runtime code changed.

## 0.1.0

### Minor Changes

- Initial release. An Astro integration that appends build duration, page count, output size, and Astro/Node versions to a JSONL log file after each build. Relocated into the `astro-lab` monorepo from a private workspace package; the integration name is now `@xsynaptic/astro-build-logger`.
