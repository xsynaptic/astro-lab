# @xsynaptic/og-image-generator

A framework-neutral Open Graph image engine: [Satori](https://github.com/vercel/satori) (which transforms an element into SVG) and [sharp](https://sharp.pixelplumbing.com/) (SVG to JPEG/PNG). Built for my own Astro projects and published for convenience, not as a general-purpose library. The template, data model, and resolver stay in your project; the engine owns the render, fonts, image helpers, and caching.

```sh
pnpm add @xsynaptic/og-image-generator sharp
```

`sharp` is a peer dependency but you almost certainly already have it.

## Usage

**Authoring templates without React.** Satori reads JSX but isn't React. Two per-file pragmas keep a `.tsx` template React-free, but they must sit at the very top _and_ be glued to whichever import your sorter ranks first — perfectionist will otherwise hoist an import above them and silently break `@jsxImportSource`. The import source is `satori/jsx`, not `satori`.

```tsx
/** @jsxRuntime automatic */
/** @jsxImportSource satori/jsx */
import { ... } from '...';
```

**Loading fonts.** `fontsourceFonts(configs, { resolveFrom: import.meta.url })` — `resolveFrom` is required so `@fontsource/*` resolves from _your_ node_modules under pnpm's strict layout (they're your dependency, not the engine's, and are loaded by a computed `require.resolve`, so add them to your knip `ignoreDependencies`). Satori reads ttf/otf/woff, not woff2.

**Choosing a cache adapter.** Two ship, for two deployment models:

- `createContentHashCache` (runtime/SSR). The hashed filename _is_ the freshness check (stateless), with in-flight request dedupe; your public URL is a stable route, the hash stays internal.
- `createStableCache` (build/static) A stable `{id}.{ext}` filename keeps the public URL fixed, with freshness in an injectable `CacheStore` (wrap your own Keyv/JSON/KV). Pass `version` to bust everything on a template change; `isFresh` skips a fresh entry without reading it back.

Both resolve `{ id, key, generate }`; `key` is whatever you fold invalidation into. Everything else (`createOgRenderer`, `resizeCover`, `toDataUrl`, `encodeDataUrl`, `createDuotone`, `analyzeLuminance`) does what its name says.
