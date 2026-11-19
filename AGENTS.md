# AGENTS.md

A pnpm monorepo of Astro integrations, markdown plugins, lint configs, web components, and other odds-and-ends, published to npm under the `@xsynaptic/*` namespace. Add to this file only what an agent can't infer from the code and config.

## Builds read `dist`

- Every package exports `dist`, and every consumer reads it: playgrounds, sibling packages' type checks, and the root lint (which loads `@xsynaptic/eslint-config` from its build). An edit shows up only after `pnpm build`, or live under `pnpm --filter <package> dev`. A type or lint error about a sibling package usually means a stale `dist`
- Exports stay on `dist` so dev runs exactly what ships; `astro-font-devtools` also resolves its toolbar entry by file URL inside its build
- Every package extends `tsconfig.base.json`, integrations included. Astro's `strictest` is an app config that stops validating relative `.js` imports
- Ambient types beyond `node` go in the package's `src/env.d.ts` (`astro-scripts` references `astro/client` there), since the root type check resolves `types` from the root, where `astro` isn't installed

## Checks

- Lefthook is the gate and there is no CI: `pnpm check` reports, `pnpm fix` autofixes then rechecks. A new check joins lefthook as a job
- Every production-level client-side entry includes a brotli size budget in `.size-limit.json`, measured from `src`. You can use `pnpm size --why` to diagnose unexpected bloat with a treemap. Dev-only client code is not subject to restrictions. The budgets match the shipped bytes because tsdown here is rolldown with minify off; recheck that if a package's tsdown config gains a `define` or a plugin!

## Published custom elements

- A `define…()` function registers the element and takes its options. The class extends a stand-in where `HTMLElement` is undefined, so the entry imports cleanly in server code
- `sideEffects` is `false` (or `["**/*.css"]` when the package ships CSS) only while no module calls `customElements.define` at load; a package that does (_e.g._ the `astro-font-devtools` toolbar) omits the field; given `false`, tsdown drops the import, the element never upgrades, and the build stays green
- An element reports through a bubbling `<owner>:<action>` event, its typed detail declared in `GlobalEventHandlersEventMap`, and never sends analytics itself; what to send is the site's call
- An element consumers restyle renders in the light DOM and ships a CSS export the host imports into its own layer; an injected sheet would beat the host's layered utilities

## Releases

- Pre-1.0: break APIs freely, with no concern for compatibility shims, migration notes or staged releases
- Every package change takes a minimal changeset, except a change confined to the README, which ships with the package's next release, or to `verify/`, which never ships
- `CHANGELOG.md` stays out of the tarball; upgrade notes link it on GitHub
- The operator commits the version bump and publishes. Publishing goes through `pnpm release` only, since pnpm rewrites `workspace:` ranges and plain `npm publish` ships them literally
