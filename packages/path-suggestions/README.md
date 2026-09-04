# @xsynaptic/path-suggestions

A helper utility for 404 pages. Scores the path a visitor asked for against the paths that actually exist, then lists the closest matches, or redirects outright when one scores high enough. It ships as two independent pieces: a scoring function with no DOM dependency, and a custom element that drives a 404 page. Either works without the other.

_Note_: this package is ESM-only.

## Install

```sh
npm install @xsynaptic/path-suggestions
```

## Use the element

Publish a JSON file listing the paths worth suggesting, as an array of `{ url, title }`, then point the element at it:

```html
<path-suggestions src="/content-manifest.json" link-class="anchor">
	<p>Did you mean one of these?</p>
</path-suggestions>

<script type="module">
	import '@xsynaptic/path-suggestions/element';
</script>
```

The element appends its own `<ul>` and leaves any other children in place, so the heading above survives. Everything renders in the light DOM, so ordinary stylesheet rules apply to the list.

Set `.entries` to score against an inlined list and skip the fetch. A value set before the element upgrades survives the upgrade, and a value set afterwards scores again, so it does not matter which script runs first:

```js
document.querySelector('path-suggestions').entries = [{ url: '/about/', title: 'About' }];
```

### Attributes

| Attribute            | Default | Meaning                                                        |
| -------------------- | ------- | -------------------------------------------------------------- |
| `src`                |         | URL of the JSON manifest; omit when setting `.entries`         |
| `threshold`          | `0.5`   | Score below which a candidate is discarded                     |
| `redirect-threshold` | `0.92`  | Score at or above which the best candidate triggers a redirect |
| `limit`              | `5`     | Most suggestions to render                                     |
| `min-length`         | `3`     | Paths shorter than this carry too little signal to score       |
| `link-*`             |         | Forwarded to each anchor with the prefix stripped              |

`link-class` sets the class, `link-data-astro-history` sets `data-astro-history`, and so on for whatever a client-side router reads off a link. The `link-` prefix is reserved for this, and `link-href` is ignored.

### State and events

The element sets `data-state` to `loading`, then to `list`, `empty`, or `redirect`, which is enough to drive a loading indicator or hide a heading:

```css
path-suggestions:not([data-state='list']) p {
	display: none;
}
```

Both events bubble. `path-suggestions:redirect` fires with `detail.url` before the element navigates, and is cancelable; cancel it to navigate through a client-side router instead. `path-suggestions:done` fires once the element has settled, with `detail.count`.

```js
document.addEventListener('path-suggestions:redirect', (event) => {
	event.preventDefault();
	router.replace(event.detail.url);
});
```

## Use the scoring function

The scoring function has no DOM dependency, so it also runs in a build script or a link checker:

```ts
import { getPathSuggestions } from '@xsynaptic/path-suggestions';

getPathSuggestions({ path: '/example', entries });
// { type: 'redirect', url: '/example-post/' }
```

Returns `undefined` when nothing clears the threshold, `{ type: 'redirect', url }` when the best candidate clears `redirectThreshold`, and `{ type: 'list', items }` otherwise, where each item carries its `score`.

Trailing slashes are stripped before comparing, so a candidate matching the requested path never triggers a redirect, and neither does one differing only by a trailing slash. That last case is canonicalization, and belongs in a 301 at the host.

`getPathSimilarity(a, b)` is the underlying score, from 0 to 1. It takes any two strings, so it has uses beyond 404 pages: naming the nearest valid ID when a content reference fails to resolve, for one.

## How the score works

Edit distance, via [fastest-levenshtein][], measured against the longer of the two strings, so `1` is identical. A bonus applies when either string contains the other, which lifts a truncated path above candidates that merely run to a similar length. Truncation is the common failure: a half-typed slug, or a link that lost its tail. That bonus is clamped, so a path that is a strict prefix of a real one scores exactly `1`.

## License

[MIT][mit-license]

[fastest-levenshtein]: https://github.com/ka-weihe/fastest-levenshtein
[mit-license]: https://opensource.org/licenses/MIT
