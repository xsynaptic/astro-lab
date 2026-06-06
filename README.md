# astro-lab

A personal monorepo of reusable packages for my Astro projects, published to npm under the `@xsynaptic` scope. Most are framework-agnostic (unified plugins, an ESLint config, image-URL tooling). Not built for wide public use, just published so my own projects can install them instead of copying source around.

## Packages

- [`@xsynaptic/eslint-config`](packages/eslint-config): ESLint flat-config factory for TypeScript projects
- [`@xsynaptic/unified-tools`](packages/unified-tools): remark/rehype/retext pipelines for markup and text
- [`@xsynaptic/rehype-wrap-cjk`](packages/rehype-wrap-cjk): rehype plugin to wrap CJK character runs for styling
- [`@xsynaptic/remark-auto-import`](packages/remark-auto-import): remark plugin that auto-imports components into MDX
- [`@xsynaptic/unpic-imagor`](packages/unpic-imagor): unpic URL provider for the imagor image server

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
