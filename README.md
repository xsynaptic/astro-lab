# astro-lab

A collection of reusable plugins, utilities, and configs for Astro projects. Built for my own use, but published via npm under the `@xsynaptic` scope for public consumption.

## Astro

- [`@xsynaptic/astro-build-logger`](packages/astro-build-logger): Astro integration that logs build duration, page count, and output size to JSONL
- [`@xsynaptic/astro-font-devtools`](packages/astro-font-devtools): Astro dev toolbar app for browsing fonts (Google, Fontsource, Bunny, Fontshare) and previewing them live on your site
- [`@xsynaptic/astro-image-loader`](packages/astro-image-loader): Astro loader treating images as content entries, with incremental sync, caching, and pluggable EXIF/dimensions extraction

## Sätteri

[Sätteri](https://satteri.bruits.org/) is a new Rust-based Markdown compiler and the default for Astro as of 2026.

- [`@xsynaptic/satteri-auto-import`](packages/satteri-auto-import): Sätteri mdast plugin that injects ESM imports into MDX
- [`@xsynaptic/satteri-img-group`](packages/satteri-img-group): Sätteri mdast plugin that stamps ImgGroup/Img layout context
- [`@xsynaptic/satteri-reading-time`](packages/satteri-reading-time): Sätteri mdast plugin that estimates multilingual reading time and injects it into Astro frontmatter
- [`@xsynaptic/satteri-trailing-slash`](packages/satteri-trailing-slash): Sätteri hast plugin that normalizes trailing slashes on internal Markdown links to match a project's `trailingSlash` setting
- [`@xsynaptic/satteri-wrap-cjk`](packages/satteri-wrap-cjk): Sätteri hast plugin to wrap CJK character runs for styling

## Unified

[unified](https://unifiedjs.com/) has long been the standard for AST processing in the JavaScript ecosystem. It remains an option for Astro but these tools and plugins are deprecated in favor of Sätteri.

- [`@xsynaptic/rehype-wrap-cjk`](packages/rehype-wrap-cjk): rehype plugin to wrap CJK character runs for styling
- [`@xsynaptic/remark-auto-import`](packages/remark-auto-import): remark plugin that auto-imports components into MDX
- [`@xsynaptic/remark-image-import`](packages/remark-image-import): remark plugin that auto-imports a component's image sources in MDX
- [`@xsynaptic/remark-img-group`](packages/remark-img-group): remark plugin that validates and stamps custom MDX components for magazine-style image layout
- [`@xsynaptic/unified-tools`](packages/unified-tools): remark/rehype/retext pipelines for markup and text

## Configs

- [`@xsynaptic/eslint-config`](packages/eslint-config): ESLint flat-config factory for TypeScript projects
- [`@xsynaptic/mdxlint-config`](packages/mdxlint-config): shared mdxlint config and a conditional-write CLI for formatting and linting MDX content
- [`@xsynaptic/stylelint-config`](packages/stylelint-config): shared Stylelint config for Astro projects using Tailwind CSS v4

## Other

- [`@xsynaptic/og-image-generator`](packages/og-image-generator): framework-neutral engine for generating Open Graph images with Satori and sharp
- [`@xsynaptic/unpic-imagor`](packages/unpic-imagor): unpic URL provider for the imagor image server
- [`@xsynaptic/word-count`](packages/word-count): fast, dependency-free multilingual word counter

## Development

```sh
pnpm install      # install dependencies and build every package
pnpm build        # rebuild packages (tsdown -> dist)
pnpm test         # run all tests (vitest)
pnpm check        # report-only: prettier check, lint, type-check, knip
pnpm fix          # auto-fix: prettier write + eslint --fix, then type-check + knip
```

## Releasing

Versioning and publishing are managed by [changesets](https://github.com/changesets/changesets):

```sh
pnpm changeset          # describe a change + pick semver bumps
pnpm changeset version  # apply bumps and update changelogs
pnpm release            # build all, then publish changed packages to npm
```
