# @xsynaptic/astro-sitemap-lastmod

Adds `lastmod` dates to the sitemap that [`@astrojs/sitemap`][sitemap] generates. You record when each page last changed, from a script or from your content loaders, and the dates show up in the sitemap when you build.

```sh
pnpm add @xsynaptic/astro-sitemap-lastmod
```

## Adding dates to the sitemap

```ts
// astro.config.ts
import sitemap from '@astrojs/sitemap';
import { sitemapLastmod } from '@xsynaptic/astro-sitemap-lastmod';
import { defineConfig } from 'astro/config';

const lastmod = sitemapLastmod({ filePath: './.cache/sitemap-lastmod.json' });

export default defineConfig({
	integrations: [sitemap({ serialize: lastmod.serialize }), lastmod.integration],
});
```

Put `lastmod.integration` after `sitemap()`. Once the sitemap is written, it logs how many URLs got a date, and warns you if none did, which usually means the recorded paths don't line up with the site's. A URL with no recorded date gets the time the dates were last recorded, or the build time if nothing has been recorded yet.

## Recording dates

```ts
import { createSitemapLastmodWriter } from '@xsynaptic/astro-sitemap-lastmod/write';

const writer = createSitemapLastmodWriter({ filePath: './.cache/sitemap-lastmod.json' });
```

From a script, pass `record` a list of paths and dates:

```ts
writer.record(posts.map((post) => [`/posts/${post.id}`, post.updatedAt]));
```

From content loaders, wrap each collection's loader with the same writer. Once a loader finishes, the writer passes you its entries and records the pairs you return:

```ts
const posts = defineCollection({
	loader: writer.wrap(glob({ base: './src/content/posts', pattern: '**/*.mdx' }), (entries) =>
		entries.map((entry) => [`/posts/${entry.id}`, getUpdatedDate(entry.data)]),
	),
});
```

The callback may be async. To date entries by their last git commit, `await createCommitDateReader({ rootPath: process.cwd() })(entries)` returns a map from each entry's `filePath` to its date; create one reader and share it across collections.

Paths should include the site's `base`, if it has one; trailing slashes don't matter. A date can be a `Date` or a date string, and entries with an `undefined` date are skipped. When two entries share a path, the newer date wins.

## License

[MIT][mit-license]

[sitemap]: https://docs.astro.build/en/guides/integrations-guide/sitemap/
[mit-license]: https://opensource.org/licenses/MIT
