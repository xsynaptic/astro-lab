# ESLint Config

A shared ESLint config factory for several Astro projects. It is not intended for public consumption.

## Astro

`getAstroConfig()` provides the Astro plugin rules and the `.astro` parser wiring. Two of its features resolve plugins from the consuming project's root (via `process.cwd()`), so those plugins must be installed there directly and cannot be relied on transitively:

- **Accessibility**: install `eslint-plugin-jsx-a11y` and pass a config, e.g. `getAstroConfig({ a11y: astroPlugin.configs['flat/jsx-a11y-strict'] })`.
- **TypeScript in `<script>` tags**: install `@typescript-eslint/parser`. eslint-plugin-astro uses it to lint `<script>` blocks, and that linting silently degrades if it is absent.
