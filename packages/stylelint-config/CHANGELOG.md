# @xsynaptic/stylelint-config

## 0.1.0

### Minor Changes

- Initial release: a shared Stylelint config for Astro projects using Tailwind CSS v4. Bundles `stylelint-config-standard`, `stylelint-config-recess-order`, `stylelint-plugin-defensive-css`, and `@double-great/stylelint-a11y`; declares the Tailwind v4 CSS-first at-rules; and registers `postcss-html` for `.astro` files. Consumed via Stylelint's native `extends`.
