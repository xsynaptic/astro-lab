# @xsynaptic/astro-image-loader

An Astro [content-layer](https://docs.astro.build/en/reference/content-loader-reference/) loader that treats images as content entries. Images are found by glob and passed to a `dataHandler` for metadata extraction (EXIF, dimensions, and so on); the output is validated against a Zod collection schema and cached.

The loader owns discovery, incremental sync, watch-mode updates, and caching. Extraction is yours, via the `dataHandler` or by composing `plugins`. Two working plugins ship with the loader: `/exif` and `/dimensions`.

```sh
pnpm add @xsynaptic/astro-image-loader
```

## Usage

`defineImageCollection(options)` returns a `{ loader, schema }` pair for `defineCollection`:

```ts
// src/content.config.ts
import { defineImageCollection } from '@xsynaptic/astro-image-loader';
import { dimensionsPlugin } from '@xsynaptic/astro-image-loader/dimensions';
import { exifPlugin } from '@xsynaptic/astro-image-loader/exif';
import { defineCollection } from 'astro:content';

export const collections = {
	images: defineCollection(
		defineImageCollection({
			base: 'src/images',
			plugins: [dimensionsPlugin(), exifPlugin({ gps: true })],
		}),
	),
};
```

Without a `schema`, the base schema (`src`, `modifiedTime`) plus any plugin fragments are used. Pass your own to match a custom `dataHandler`. The bare `imageLoader(options)` factory is also exported.

## Options

- `base`: directory to resolve images from, either relative to the project root or absolute; entries are always stored and cached with a root-relative path, so images must resolve inside the project root for `image()` fields to work
- `pattern`: glob pattern(s) relative to `base`; defaults to Astro's raster formats (no SVG)
- `concurrency`: how many images are processed at once
- `debounceMs`: debounce window for watch-mode file events
- `invalidationKey`: key folded into every entry digest; change it to force regeneration
- `generateId`: entry ID factory, defaults to the relative file path
- `dataHandler`: metadata extraction callback; its output is merged into entry data and validated by the schema
- `plugins`: prepackaged option bundles (see below)
- `cache`: storage for dataHandler output; a JSONL file under Astro's `cacheDir` by default. Pass a `{ get, set, prune? }` implementation, `createJsonlCache({ filePath })` to relocate the default, or `false` to disable. `prune` is called at most once per load, after all `set` calls have settled, so implementations need not handle concurrent mutation
- `beforeLoad` / `afterLoad`: batch lifecycle hooks

## Plugins

A plugin bundles the option surface: `{ schema?, dataHandler?, beforeLoad?, afterLoad?, invalidationKey? }`. Pass an array to `plugins`; outputs merge flat (array order wins, the inline `dataHandler` last) and schema fragments merge into the collection schema.

- **`/exif`** (`exifPlugin(options?)`): a curated set of EXIF fields via [exiftool-vendored](https://github.com/photostructure/exiftool-vendored.js). GPS is stripped by default; pass `{ gps: true }` for `latitude`/`longitude`.
- **`/dimensions`** (`dimensionsPlugin()`): `width` and `height` via [sharp](https://sharp.pixelplumbing.com/).

Both peers are optional; install the one you import.

## Rendering through astro:assets

Entries expose `src` for URL-based rendering. For `<Image>` optimization, add an `image()` field pointing at the image's own basename via the bare factory and a function schema:

```ts
import { imageLoader, ImageLoaderBaseSchema } from '@xsynaptic/astro-image-loader';
import { defineCollection } from 'astro:content';
import path from 'node:path';

const images = defineCollection({
	loader: imageLoader({
		base: 'src/images',
		dataHandler: ({ filePath }) => ({ image: `./${path.basename(filePath)}` }),
	}),
	schema: ({ image }) => ImageLoaderBaseSchema.extend({ image: image() }),
});
```

## Notes

- An entry re-processes only when `{ id, filePath, mtime, base, invalidationKey }` changes; cached output survives a data store wipe
- `dataHandler` output must be JSON-serializable; use `z.coerce.date()` for dates
- Local images only; remote URLs are out of scope
- Tested on Astro 7 but it should work on Astro 6
- See also: [astro-image-exif-loader](https://github.com/OliverSpeir/astro-image-exif-loader) for a dedicated EXIF-only loader
