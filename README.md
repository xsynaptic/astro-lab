# astro-lab

A personal monorepo of reusable packages for my Astro projects, published to npm under the `@xsynaptic` scope. Most are framework-agnostic (unified plugins, an ESLint config, image-URL tooling). Not built for wide public use, just published so my own projects can install them instead of copying source around.

## Packages

- [`@xsynaptic/astro-build-logger`](packages/astro-build-logger): Astro integration that logs build duration, page count, and output size to JSONL
- [`@xsynaptic/eslint-config`](packages/eslint-config): ESLint flat-config factory for TypeScript projects
- [`@xsynaptic/rehype-wrap-cjk`](packages/rehype-wrap-cjk): rehype plugin to wrap CJK character runs for styling
- [`@xsynaptic/remark-auto-import`](packages/remark-auto-import): remark plugin that auto-imports components into MDX
- [`@xsynaptic/remark-image-import`](packages/remark-image-import): remark plugin that auto-imports a component's image sources in MDX
- [`@xsynaptic/remark-img-group`](packages/remark-img-group): remark plugin that validates and stamps MDX ImgGroup/Img layout (reference implementation)
- [`@xsynaptic/satteri-auto-import`](packages/satteri-auto-import): Sätteri mdast plugin that injects ESM imports into MDX
- [`@xsynaptic/satteri-img-group`](packages/satteri-img-group): Sätteri mdast plugin that stamps ImgGroup/Img layout context
- [`@xsynaptic/satteri-wrap-cjk`](packages/satteri-wrap-cjk): Sätteri hast plugin to wrap CJK character runs for styling
- [`@xsynaptic/stylelint-config`](packages/stylelint-config): shared Stylelint config for Astro projects using Tailwind CSS v4
- [`@xsynaptic/unified-tools`](packages/unified-tools): remark/rehype/retext pipelines for markup and text
- [`@xsynaptic/unpic-imagor`](packages/unpic-imagor): unpic URL provider for the imagor image server
- [`@xsynaptic/word-count`](packages/word-count): fast, dependency-free multilingual word counter

## Development

```sh
pnpm install      # install dependencies and build every package
pnpm build        # rebuild packages (tsdown -> dist)
pnpm test         # run all tests (vitest)
pnpm check        # lint, type-check, format, and knip
```

## Releasing

Versioning and publishing are managed by [changesets](https://github.com/changesets/changesets):

```sh
pnpm changeset          # describe a change + pick semver bumps
pnpm version-packages   # apply bumps and update changelogs
pnpm release            # build all, then publish changed packages to npm
```
