# @xsynaptic/satteri-trailing-slash

A [Sätteri][] hast plugin that normalizes trailing slashes on internal markdown links to match your
Astro project's [`trailingSlash`][astro-trailing-slash] setting. Hand-authored links like
`[text](/path)` emit whatever slash the author typed; when that disagrees with the site's canonical
form, each link costs a redirect hop. This rewrites them at compile time.

Only internal root-relative `<a href>` links are touched, and any `?query`/`#hash` suffix is
preserved. External, protocol-relative (`//`), hash-only, `mailto:`/`tel:`, and file-extension links
are left alone, as are MDX components like `<Link>` (they aren't `<a>` nodes at hast time).

## Install

```sh
npm install @xsynaptic/satteri-trailing-slash
```

This package is ESM-only.

## Use

Pass the same value your `astro.config` uses for `trailingSlash`. The one option, `trailingSlash`,
takes `'always'` (append a slash), `'never'` (strip it), or `'ignore'` (the default: a no-op, matching
Astro's own default).

```ts
import { satteri } from '@astrojs/markdown-satteri';
import { trailingSlash } from '@xsynaptic/satteri-trailing-slash';

export default defineConfig({
	trailingSlash: 'always',
	markdown: {
		processor: satteri({ hastPlugins: [trailingSlash({ trailingSlash: 'always' })] }),
	},
});
```

## License

[MIT][mit-license]

[Sätteri]: https://github.com/bruits/satteri
[astro-trailing-slash]: https://docs.astro.build/en/reference/configuration-reference/#trailingslash
[mit-license]: https://opensource.org/licenses/MIT
