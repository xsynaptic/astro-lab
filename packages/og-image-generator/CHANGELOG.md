# @xsynaptic/og-image-generator

## 1.1.1

### Patch Changes

- Update `satori` to `^0.33.3`

## 1.1.0

### Minor Changes

- Update satori to `^0.33.1`, adding `corner-shape`, `shape()` in `clip-path`, and `backdrop-filter`.

## 1.0.0

### Major Changes

- Add WebP as an output format for `createOgRenderer`. JPEG remains the default.

  `toDataUrl` and `encodeDataUrl` now take a narrower `DataUrlFormat` (JPEG or PNG), since librsvg cannot rasterize WebP or GIF embedded in Satori's SVG. WebP source images are unaffected.

- First stable release. No API changes: the public surface is now covered by semver, so patches and minor releases reach a `^1.0.0` range without a manual bump.

  The Sätteri plugins stay on `0.x` until Sätteri itself reaches 1.0.

## 0.2.0

### Minor Changes

- Bump `satori` to `^0.28`.

## 0.1.2

### Patch Changes

- Raise the `sharp` peer dependency to `^0.35.2`.

## 0.1.1

### Patch Changes

- Import the `Sharp` type directly from `sharp` instead of deriving it via `ReturnType<typeof sharp>`. Sharp 0.35's ESM type declarations export `Sharp` as a named type, which resolves correctly under TypeScript 6 and `nodenext`. No runtime or type-shape change.

## 0.1.0

### Minor Changes

- Initial release. A framework-neutral Open Graph image engine built on Satori and sharp.

  - `createOgRenderer` (element → JPEG/PNG) and `fontsourceFonts` for loading `@fontsource` fonts under pnpm.
  - Two cache adapters behind one port: `createContentHashCache` (runtime/SSR, hashed filename) and `createStableCache` (build/static, stable filename with an injectable `CacheStore` and a template `version`).
  - Image helpers `resizeCover`, `toDataUrl`, `encodeDataUrl`, plus `createDuotone` and `analyzeLuminance`.
  - Templates author in satori/jsx, with no React dependency.
