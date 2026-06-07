# @xsynaptic/eslint-config

## 3.6.0

### Minor Changes

- Forbid JSX `&&` conditional rendering by default and make `no-restricted-syntax` extendable. The base config now flags `condition && <Element />` inside JSX, steering toward a ternary returning `undefined`. A new `restrictedSyntax` option concatenates extra selectors onto the defaults so consumers can add their own restrictions without clobbering the built-in entries (ESLint's `rules` keys replace wholesale rather than merging). The default selectors are also exported as `restrictedSyntaxDefaults`.
- Add `getAstroConfig()`: Astro plugin rules, `.astro` parser wiring, and the disableTypeChecked blocks `.astro` files need. Opt into a11y by passing a config (e.g. `astroPlugin.configs['flat/jsx-a11y-strict']`). Bundles `eslint-plugin-astro`.

## 3.5.0

### Minor Changes

- Adopt perfectionist's full `recommended-natural` ruleset instead of enabling only `sort-imports`. The previous config turned nearly every perfectionist rule off; this takes advantage of the plugin's dependency-aware sorting and per-rule guards. The custom `sort-imports` options were dropped as redundant: perfectionist v5's default `internalPattern` already covers `~/`, `@/`, and `#`, and `recommended-natural` applies natural ordering globally.

  Consumers can disable or adjust any individual rule via their own config (it overrides last). Note: this newly flags previously-passing code, though all violations are autofixable with `eslint --fix`.

## 3.4.1

### Patch Changes

- Configure `unicorn/number-literal-case` with `hexadecimalValue: 'lowercase'` so hexadecimal literals are enforced as lowercase, matching Prettier. This resolves the autofix oscillation where ESLint wanted uppercase hex digits and Prettier rewrote them to lowercase.

## 3.4.0

### Minor Changes

- 28cd802: Add an opt-in `getWebComponentConfig(files)` export with best-practice rules for authoring native web components (custom elements). `eslint-plugin-wc` is now bundled as a dependency.

### Patch Changes

- 28cd802: Relocate into the `astro-lab` monorepo: update repository and homepage metadata, add a LICENSE file, and standardize packaging (tsdown entry, manifest fields). No changes to the public API.
