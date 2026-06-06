# @xsynaptic/eslint-config

## 3.4.1

### Patch Changes

- Configure `unicorn/number-literal-case` with `hexadecimalValue: 'lowercase'` so hexadecimal literals are enforced as lowercase, matching Prettier. This resolves the autofix oscillation where ESLint wanted uppercase hex digits and Prettier rewrote them to lowercase.

## 3.4.0

### Minor Changes

- 28cd802: Add an opt-in `getWebComponentConfig(files)` export with best-practice rules for authoring native web components (custom elements). `eslint-plugin-wc` is now bundled as a dependency.

### Patch Changes

- 28cd802: Relocate into the `astro-lab` monorepo: update repository and homepage metadata, add a LICENSE file, and standardize packaging (tsdown entry, manifest fields). No changes to the public API.
