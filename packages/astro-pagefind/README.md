# @xsynaptic/astro-pagefind

An Astro integration that indexes your site with [Pagefind][pagefind] after each build. The search bundle goes in a folder named for the Pagefind version, so upgrading Pagefind gives the bundle new URLs. In dev, it serves the bundle from your last build. It's based on [`astro-pagefind`][astro-pagefind] by Sergey Shishkin. It also ships a [search toggle](#search-toggle) that loads Pagefind's modal search on first use.

```sh
pnpm add @xsynaptic/astro-pagefind pagefind @pagefind/component-ui
```

Your site installs `pagefind` itself, so you choose and pin the version. `@pagefind/component-ui` is optional; skip it if you use Pagefind's default UI. If you do install it, keep it at the same version as `pagefind`, since the UI reads an index format that changes between releases. The integration checks this before the build starts.

## Setup

```ts
// astro.config.ts
import pagefind from '@xsynaptic/astro-pagefind';
import { defineConfig } from 'astro/config';

export default defineConfig({
	integrations: [
		pagefind({
			indexConfig: {
				excludeSelectors: [
					"[id='footnote-label']",
					"[id^='user-content-fnref']",
					'[data-footnote-backref]',
				],
			},
		}),
	],
});
```

`indexConfig` goes to Pagefind's [`createIndex`][create-index]. A wrong type or an unknown key fails when the config loads; on a Pagefind release newer than 1.6, an unknown key may be a new option, so it gets a warning and passes through.

After the build, the bundle is in `pagefind/<version>/` inside the output directory, for example `dist/pagefind/1.6.0/`.

With `output: 'server'`, only pages that opt into prerendering are indexed.

## Pointing the UI at the bundle

The bundle isn't at `/pagefind/`, so the UI needs its path. `getBundlePath` adds the bundle folder to your `base`, whether or not `base` ends in a slash:

```astro
---
import { getBundlePath } from '@xsynaptic/astro-pagefind/bundle';
---

<pagefind-config bundle-path={getBundlePath(import.meta.env.BASE_URL)}></pagefind-config>
```

The integration passes the version into your site code at build time, so pages rendered on demand work without Pagefind on the server. Outside Astro, in a deploy script for example, the helpers read the installed version instead. `getBundleDir()` returns the same folder without `base`.

Pagefind's default UI looks for the bundle next to its own script, so load the script from the bundle path:

```astro
---
import { getBundlePath } from '@xsynaptic/astro-pagefind/bundle';

const bundlePath = getBundlePath(import.meta.env.BASE_URL);
---

<link href={`${bundlePath}pagefind-ui.css`} rel="stylesheet" />
<script is:inline src={`${bundlePath}pagefind-ui.js`}></script>
```

## Search toggle

`<search-toggle>` opens Pagefind's modal search from your own button. It loads `@pagefind/component-ui` and your Pagefind stylesheet only when someone reaches for search: on hover, focus, click, or `⌘K` (`Ctrl+K` elsewhere). It needs `@pagefind/component-ui` installed.

```astro
---
import { getBundlePath } from '@xsynaptic/astro-pagefind/bundle';

import pagefindCssUrl from '../styles/pagefind.css?url';
---

<search-toggle shortcut-description="Search" stylesheet={pagefindCssUrl}>
	<button aria-expanded="false" aria-haspopup="dialog" aria-label="Search" type="button">
		<!-- your icon -->
	</button>
</search-toggle>
<pagefind-config bundle-path={getBundlePath(import.meta.env.BASE_URL)}></pagefind-config>
<pagefind-modal reset-on-close={true}></pagefind-modal>

<script>
	import { defineSearchToggle } from '@xsynaptic/astro-pagefind/search-toggle';

	defineSearchToggle();
</script>
```

The first `<button>` inside the element is the trigger, and its markup and styling are yours. Render it with the three ARIA and type attributes above so it reads correctly before the element upgrades. The modal can go anywhere on the page. Render one toggle per Pagefind instance: when the modal closes, Pagefind resets `aria-expanded` on the first trigger only.

| Attribute | Purpose |
| --- | --- |
| `stylesheet` | URL of your Pagefind stylesheet, loaded on first use. Leave it out if you load Pagefind's CSS yourself |
| `shortcut-description` | Label for the shortcut in `<pagefind-keyboard-hints>` |
| `instance` | Pagefind instance name, `default` unless set |

### Stylesheet

```css
@import '@xsynaptic/astro-pagefind/search-toggle.css' layer(components);
```

It hides the toggle until it upgrades, and keeps `<pagefind-config>` and `<pagefind-modal>` out of your layout before and after Pagefind's sheet loads. Your own Pagefind stylesheet needs only Pagefind's CSS and your `--pf-*` theme:

```css
@import '@pagefind/component-ui/css/pagefind-component-ui.css';

:root {
	--pf-background: #f4f1ea;
}
```

### Search events

When a search ends, the toggle dispatches `search-toggle:search-end` on `document`, with this detail:

- `clicked`: whether it ended on a result click
- `query`: the trimmed term Pagefind last returned results for
- `results`: the number of text matches; a match only on `image` or `image_2x` meta doesn't count

A search ends when the modal closes or a ClientRouter navigation replaces the page. One with no query, or one open during a full page load, isn't reported.

`searchToggleSearchEndEventName` and `normalizeSearchQuery` are exported from `./search-toggle`. Before reporting a query, `normalizeSearchQuery` collapses its whitespace and caps it at 100 characters, or returns `undefined` under 2. Add the listener once at module level, not on `astro:page-load`, or each navigation adds another.

## Why the version is in the path

`pagefind.js`, `pagefind-worker.js` and the `.pagefind` WebAssembly files keep the same names from one Pagefind release to the next. If your host caches `*.js` for a long time, visitors can end up with an old `pagefind.js` reading a new index. With the version in the path, each release gets its own URLs.

## Dev

Run `astro build` once before searching in dev, since dev serves the bundle from the last build. Later rebuilds show up without restarting dev. With an adapter, Astro writes prerendered pages to `build.client` unless the adapter's output is static, so dev looks in both `build.client` and `outDir`.

## Deploying

Each Pagefind upgrade writes a new folder. If your deploy deletes files that are no longer in `dist`, the old folder goes with them, and anyone with HTML cached from before the upgrade loses search. Keep old version folders on the host for as long as your HTML can stay cached, then remove them.

## License

[MIT][mit-license]. The hook layout and dev middleware come from `astro-pagefind`, used under the MIT License. See [LICENSE](./LICENSE) for the full notice.

[pagefind]: https://pagefind.app/
[astro-pagefind]: https://github.com/shishkin/astro-pagefind
[create-index]: https://pagefind.app/docs/node-api/
[mit-license]: https://opensource.org/licenses/MIT
