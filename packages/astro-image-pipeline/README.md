# @xsynaptic/astro-image-pipeline

Image renditions for Astro sites with more images than the bundler can handle. The build records each image a page asks for, then a separate process renders them with sharp into a file cache. File names stay stable between builds. This is an early release, so expect the API to change.

```sh
pnpm add @xsynaptic/astro-image-pipeline sharp
```

## Entry points

- `@xsynaptic/astro-image-pipeline`: the Astro integration, which records names during builds, writes the manifest, and renders images on request in dev.
- `@xsynaptic/astro-image-pipeline/names`: naming renditions and cards from page code. It doesn't import sharp or `node:fs`.
- `@xsynaptic/astro-image-pipeline/node`: rendering, sweeping, placeholders and the cache paths, for scripts and server code.

## Setup

```ts
import { defineConfig } from 'astro/config';
import imagePipeline from '@xsynaptic/astro-image-pipeline';

export default defineConfig({
	integrations: [
		imagePipeline({
			baseUrl: 'https://img.example.com',
			cachePath: '.cache/images',
			encoding: { jpg: { quality: 85 }, webp: { quality: 70 } },
			mediaPath: 'media',
		}),
	],
});
```

Leave out `baseUrl` on a site that only renders OpenGraph cards; dev then serves no renditions.

The pipeline owns everything in `cachePath`, so keep other files out of it. The render, sweep and card functions take the same `cachePath` as the integration; nothing in the build output records it, since that output gets deployed. Each build keeps its own manifest in `manifests/<buildId>.json.gz` and writes its id to `image-build-id.txt` in the build output; `listImageBuilds` lists builds with their write times. `prepareImageSweep({ cachePath, keep })` finds renditions that neither the builds in `keep` nor the newest build reference, and its `run()` deletes them; OpenGraph cards are never swept.

## Rules

Only names made with `getRenditionName` (or `getCardName` for OpenGraph cards) during a build get rendered.

- Make image URLs while pages render, or in prerendered endpoints.
- Don't make them in content loaders (a cached run records nothing) or in on-demand routes.
- `prepareRenditionRender({ cachePath, distPath })` reads the manifest of the build in `distPath` and returns its `total` and a `run` function that renders it. It refuses a manifest from another version, so rebuild first.
