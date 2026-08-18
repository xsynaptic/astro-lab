# @xsynaptic/astro-font-devtools

## 1.0.1

### Patch Changes

- Update `unifont` to 0.7.5, which adds variable weight support for the Fontshare provider, honours the `HTTPS_PROXY` environment variable, returns fallbacks from `resolveFont()` where possible, and fixes multi-axis font resolution for Fontsource.

## 1.0.0

### Major Changes

- First stable release. No API changes: the public surface is now covered by semver, so patches and minor releases reach a `^1.0.0` range without a manual bump.

  The Sätteri plugins stay on `0.x` until Sätteri itself reaches 1.0.

## 0.5.0

### Minor Changes

- Move the package into the astro-lab monorepo, which is now its primary home and publisher. No changes to runtime behavior or the public API; the npm package name is unchanged. Repository, homepage, and issue links now point at astro-lab.

### Patch Changes

- Fix non-Latin font handling across the toolbar.

  - The script filter no longer hides multi-script fonts: selecting a script keeps any font that supports it, instead of only fonts built exclusively for the selected scripts. Fonts like Victor Mono that also ship Cyrillic or Greek now appear under a Latin selection.
  - The toolbar now opens with no script filter applied, showing the full catalog; picking a script narrows the list from there.
  - Font previews no longer load Latin glyphs only. The resolve handler requests the selected font's actual subset coverage, so Cyrillic, Greek, and other scripts render correctly when previewed (the browser still lazily downloads only the subset files a page uses).

## 0.4.1

### Patch Changes

- Upgrade dev dependencies (Astro 7.0.3, Vite 8.1, Playwright 1.61.1) and tooling

## 0.4.0

### Minor Changes

- Require Node.js >= 24.

## 0.3.0

### Minor Changes

- Add support for Astro 7 and widen the supported peer range to `^6.3.8 || ^7.0.0`.

## 0.2.0

### Minor Changes

- Reorganize the repo into a pnpm monorepo: the package now lives under `packages/astro-font-devtools` with a private, tooling-only root. Adopt changesets for versioning and publishing, consolidate ESLint onto the shared `@xsynaptic/eslint-config`, and gate releases on the full lint, type-check, format, build, and unit/e2e test suite. No changes to the package's runtime behavior or public API.

### Patch Changes

- Escape interpolated values in CSS attribute selectors with `CSS.escape()`. Font keys, family names, and provider ids that contain CSS-special characters no longer break the selector used to find or remove injected `<style>` elements and provider toggles.
