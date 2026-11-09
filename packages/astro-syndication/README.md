# @xsynaptic/astro-syndication

Helpers for standardizing syndication across Astro sites: a shared item model, off-page rendering, feed-safe HTML, and an RSS writer. Your site picks the entries and maps them to items; the package does the rest.

```sh
pnpm add @xsynaptic/astro-syndication @astrojs/rss
```

`@astrojs/rss` is an optional peer, needed only for `./rss`.

## Items

A `SyndicationItem` has a `title`, an absolute `url`, a `dateCreated`, `tags`, and optionally `dateUpdated`, `description`, `contentHtml`, `authors` (`name`, optional `url`) and an `image` (`url`, `alt`, `type`, `width`, `height`). Image URLs may be root-relative.

Date-only values parse to midnight UTC. `anchorDateOnly(date, { utcOffsetHours: 8 })` moves values at exactly midnight UTC to midnight in your timezone, so today's entries aren't dated in the future.

`toSyndicationImage(await getImage({ format: 'jpg', src, width: 1200 }), { alt })` builds an item image from a `getImage()` result.

## Rendering content

```ts
import mdxRenderer from '@astrojs/mdx/server.js';
import { createSyndicationRenderer } from '@xsynaptic/astro-syndication/render';
import { render } from 'astro:content';

const renderFeed = await createSyndicationRenderer({
	renderers: [{ name: 'mdx', renderer: mdxRenderer }],
	site: new URL(import.meta.env.SITE),
});

const { Content } = await render(entry);
const html = await renderFeed(Content);
```

`createSyndicationRenderer` returns a function that renders a component with optional `props` and `locals`. Every render sets `Astro.locals.isFeed` to `true`, and importing `./render` adds `isFeed` to `App.Locals`.

## Feed-safe HTML

```ts
import { prepareSyndicationHtml } from '@xsynaptic/astro-syndication/html';

const contentHtml = prepareSyndicationHtml(html, { site });
```

This sanitizes the HTML with `syndicationSchema` (GitHub's schema from [`hast-util-sanitize`][hast-util-sanitize], plus `figure`, `figcaption` and `tel:` links, with ids kept as written), then resolves relative `href`, `src`, `srcset` and `poster` values against `site`. To change the schema, spread `syndicationSchema` and pass your version as `schema`.

## RSS

```ts
// src/pages/rss.xml.ts
import type { APIRoute } from 'astro';

import { getRssResponse } from '@xsynaptic/astro-syndication/rss';

export const GET = (async (context) =>
	getRssResponse({
		items: await getSyndicationItems(),
		publication: {
			copyright: '© 2026 Example',
			description: 'Notes and photographs',
			image: { height: 144, url: '/feed-logo.png', width: 144 },
			language: 'en-us',
			site: context.site,
			title: 'Example',
		},
		selfUrl: 'https://example.com/rss.xml',
	})) satisfies APIRoute;
```

Each item gets a link, categories from `tags`, a `dc:creator` per author, full content, and its image as MRSS `media:content`. Its date is `dateUpdated` when there is one, `dateCreated` otherwise. The channel's `lastBuildDate` is the newest item date. Item links are written as you give them, so include the trailing slash your routes use.

The publication `image` becomes the channel `<image>`; the writer warns when it is over 144 × 400 px or an SVG.

## License

[MIT][mit-license]

[hast-util-sanitize]: https://github.com/syntax-tree/hast-util-sanitize
[mit-license]: https://opensource.org/licenses/MIT
