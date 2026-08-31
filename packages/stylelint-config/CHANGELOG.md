# @xsynaptic/stylelint-config

## 1.1.4

### Patch Changes

- Stop enabling `a11y/selector-pseudo-class-focus`. It only checks the hovered rule's siblings for a `:focus`, so a hover guarded by `@media (hover: hover)` false-positives, and its autofix moves the focus styles inside the guard.

## 1.1.3

### Patch Changes

- Stop two `stylelint-config-recommended` v18 rules reporting false positives on Tailwind v4 directives: `nesting-selector-no-missing-scoping-root` now ignores `@utility` and `@custom-variant`, and `no-invalid-position-declaration` ignores `@utility`.

## 1.1.2

### Patch Changes

- Widen `custom-property-pattern` so Tailwind v4 theme variables stop reporting false positives. `stylelint-config-standard` rejects the paired modifier form (`--text-2xl--line-height`) and both namespace reset forms (`--color-*: initial`, `--*: initial`), all of which Tailwind documents. The rule also walks `var()` arguments, so a project that merely reads a built-in theme variable was flagged even without a `@theme` block. Non-kebab-case names are still reported.

## 1.1.1

### Patch Changes

- Update `stylelint-config-recess-order` to 7.8.0. Property ordering changed upstream: the multi-column group moved, `column-rule` properties folded into a new gaps group, and `transition-behavior` was added. Running `stylelint --fix` may reorder some declarations.

## 1.1.0

### Minor Changes

- Bump `postcss-html` to `^2.0.0`. The major is ESM-only and raises the Node floor to `^22.12 || >=24`.

## 1.0.0

### Major Changes

- First stable release. No API changes: the public surface is now covered by semver, so patches and minor releases reach a `^1.0.0` range without a manual bump.

  The Sätteri plugins stay on `0.x` until Sätteri itself reaches 1.0.

## 0.1.2

### Patch Changes

- Bump `stylelint-plugin-defensive-css` to `^2.9.4`.

## 0.1.1

### Patch Changes

- Fix a broken 0.1.0. Remove the invalid `ignoreFunctions` option on `declaration-property-value-no-unknown`, which Stylelint rejects and which errored out any consumer. The rule now sits at the `stylelint-config-standard` default. Also move `reportDescriptionlessDisables` out of the shared config so consumers set it themselves.

## 0.1.0

### Minor Changes

- Initial release: a shared Stylelint config for Astro projects using Tailwind CSS v4. Bundles `stylelint-config-standard`, `stylelint-config-recess-order`, `stylelint-plugin-defensive-css`, and `@double-great/stylelint-a11y`; declares the Tailwind v4 CSS-first at-rules; and registers `postcss-html` for `.astro` files. Consumed via Stylelint's native `extends`.
