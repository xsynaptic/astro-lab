# @xsynaptic/og-image-generator

## 0.1.0

### Minor Changes

- Initial release. A framework-neutral Open Graph image engine built on Satori and sharp.

  - `createOgRenderer` (element → JPEG/PNG) and `fontsourceFonts` for loading `@fontsource` fonts under pnpm.
  - Two cache adapters behind one port: `createContentHashCache` (runtime/SSR, hashed filename) and `createStableCache` (build/static, stable filename with an injectable `CacheStore` and a template `version`).
  - Image helpers `resizeCover`, `toDataUrl`, `encodeDataUrl`, plus `createDuotone` and `analyzeLuminance`.
  - Templates author in satori/jsx, with no React dependency.
