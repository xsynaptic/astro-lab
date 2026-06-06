# Stylelint Config

A shared Stylelint config for Astro projects using Tailwind CSS v4. It is not intended for public consumption.

Bundles `stylelint-config-standard` and `stylelint-config-recess-order` with the `defensive-css` and `a11y` plugins, teaches Stylelint the Tailwind v4 CSS-first directives and functions, and registers `postcss-html` for `.astro` files.

## Usage

```js
// stylelint.config.mjs
export default {
	extends: ['@xsynaptic/stylelint-config'],
	ignoreFiles: ['src/styles/vendor-component.css'],
};
```

`stylelint` is a peer dependency. Set `ignoreFiles` in your own config; the rest merges via Stylelint's `extends` cascade.
