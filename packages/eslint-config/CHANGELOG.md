# @xsynaptic/eslint-config

## 5.0.1

### Patch Changes

- Enforce ternary-style conditional object spreads via `unicorn/consistent-conditional-object-spread: ['error', 'ternary']`, consistent with the existing no-`&&`-in-JSX rendering rule.

## 5.0.0

### Major Changes

- Upgrade `eslint-plugin-astro` to v2 and `eslint-plugin-unicorn` to v68.

  Breaking:

  - `eslint-plugin-astro` v2 requires ESLint `>=10` and Node `^22.22.3 || ^24.16.0 || >=26.3.0`, and adds `astro/no-prerender-export-outside-pages` to the recommended config.
  - `eslint-plugin-unicorn` v68 renames `prevent-abbreviations` to `name-replacements` and adds rules to the recommended preset.

  Consumers must be on ESLint 10 and a supported Node version, and may need to triage newly reported lint errors.

## 4.0.1

### Patch Changes

- Fold commonly-disabled unicorn v67 rules into the shared config so downstream apps stop duplicating them: turn off `consistent-class-member-order`, `no-invalid-argument-count`, `no-top-level-assignment-in-function`, and `prefer-uint8array-base64`; set `max-nested-calls` to `max: 5`; turn off `wc/guard-super-call` in `getWebComponentConfig`.

## 4.0.0

### Major Changes

- Require ESLint 10. `@eslint/js` is bumped to v10 and the bundled `eslint-plugin-unicorn` now sits at v67, which peers on `eslint >=10.4`. Consumers must upgrade to `eslint@^10` (and bump `@eslint/js` to v10 if they pin it directly).

  The unicorn v67 `recommended` set (up from v65 in 3.8.0) adds several rules that consumers inherit through the spread config, including `consistent-boolean-name`, `prefer-await`, `prefer-switch`, `max-nested-calls`, and `no-top-level-side-effects`. Expect new findings on existing code.

  `unicorn/prefer-iterator-to-array` is disabled. It steers `[...iterable]` toward `Iterator#toArray()`, an ES2025 iterator helper that requires the `esnext.iterator` TypeScript lib and lacks support in older browsers, so the plain spread is kept instead.

## 3.8.0

### Minor Changes

- Bump bundled dependencies: `eslint-plugin-unicorn` to v65 (a major bump that changes the spread `recommended` rule set consumers inherit) and `typescript-eslint` to ^8.61.

## 3.7.0

### Minor Changes

- Require a description on every ESLint disable directive via `@eslint-community/eslint-comments/require-description` (e.g. `// eslint-disable-next-line no-foo -- reason`). `eslint-enable` is exempt. This newly flags existing disable comments that lack a description.

### Patch Changes

- Document `getAstroConfig()`'s two cwd-resolved peers in the README: `eslint-plugin-jsx-a11y` (for a11y) and `@typescript-eslint/parser` (for TypeScript in `.astro` `<script>` tags). Both must be installed in the consuming project directly, since eslint-plugin-astro resolves them from the project root rather than transitively.

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
