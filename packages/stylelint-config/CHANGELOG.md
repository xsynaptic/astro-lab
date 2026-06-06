# @xsynaptic/stylelint-config

## 0.1.1

### Patch Changes

- Fix a broken 0.1.0. Remove the invalid `ignoreFunctions` option on `declaration-property-value-no-unknown`, which Stylelint rejects and which errored out any consumer. The rule now sits at the `stylelint-config-standard` default. Also move `reportDescriptionlessDisables` out of the shared config so consumers set it themselves.

## 0.1.0

### Minor Changes

- Initial release: a shared Stylelint config for Astro projects using Tailwind CSS v4. Bundles `stylelint-config-standard`, `stylelint-config-recess-order`, `stylelint-plugin-defensive-css`, and `@double-great/stylelint-a11y`; declares the Tailwind v4 CSS-first at-rules; and registers `postcss-html` for `.astro` files. Consumed via Stylelint's native `extends`.
