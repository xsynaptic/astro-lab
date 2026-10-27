# @xsynaptic/astro-image-pipeline

Image renditions for Astro sites with more images than the bundler can handle. The build records each image a page asks for, then a separate process renders them with sharp into a file cache. File names stay stable between builds. This is an early release, so expect the API to change.

```sh
pnpm add @xsynaptic/astro-image-pipeline sharp
```

## Entry points

- `@xsynaptic/astro-image-pipeline`: the Astro integration. It records names during builds, writes the manifest, and renders images on request in dev.
- `@xsynaptic/astro-image-pipeline/presets`: `defineImagePipeline`, `defineOpenGraphCards` and the name helpers. It doesn't import sharp or `node:fs`, so page code can use it.
- `@xsynaptic/astro-image-pipeline/node`: `renderImages`, `renderOpenGraphCards`, `openImageSource` and the cache helpers. Run the render in its own process after the build.

## Setup

```ts
import { defineConfig } from 'astro/config';
import imagePipeline from '@xsynaptic/astro-image-pipeline';

import { pipeline } from './src/images';

export default defineConfig({
	integrations: [
		imagePipeline({
			baseUrl: 'https://img.example.com',
			cachePath: '.cache/images',
			mediaPath: 'media',
			pipeline,
		}),
	],
});
```

The pipeline owns everything in `cachePath`, so keep other files out of it.

## Rules

Only names made with `getName` (or `getCardName` for OpenGraph cards) during a build get rendered.

- Make image URLs while pages render, or in prerendered endpoints.
- Don't make them in content loaders (a cached run records nothing) or in on-demand routes.
- `renderImages` renders what the last build recorded. It refuses a manifest from another version, so rebuild first.
