# @xsynaptic/web-components

Small light-DOM custom elements for Astro sites. Each element has its own subpath and registers when you call its `define…()` function. Styling is yours: the elements only set attributes and custom properties.

```sh
npm install @xsynaptic/web-components
```

## `<path-suggestions>`

A did-you-mean for 404 pages. It scores the requested path against a JSON manifest of `{ url, title }`, then lists the closest matches or redirects to a clear winner.

```astro
<path-suggestions link-class="anchor" src="/content-manifest.json">
	<p>Did you mean one of these?</p>
</path-suggestions>

<script>
	import { navigate } from 'astro:transitions/client';
	import { definePathSuggestions } from '@xsynaptic/web-components/path-suggestions';

	document.addEventListener('path-suggestions:redirect', (event) => {
		event.preventDefault();
		void navigate(event.detail.url, { history: 'replace' });
	});
	definePathSuggestions();
</script>
```

| Attribute            | Default | Meaning                                     |
| -------------------- | ------- | ------------------------------------------- |
| `src`                |         | URL of the manifest, or set `.entries`      |
| `threshold`          | `0.5`   | Score below which a candidate is dropped    |
| `redirect-threshold` | `0.92`  | Score at which the best candidate redirects |
| `limit`              | `5`     | Most suggestions to list                    |
| `min-length`         | `3`     | Shorter paths are not scored                |
| `link-*`             |         | Copied to each link without the prefix      |

The element appends a `<ul>` and sets `data-state` to `loading`, then `list`, `empty` or `redirect`. `path-suggestions:redirect` is cancelable and fires before `location.replace`; `path-suggestions:done` fires once settled.

The scorer, `getPathSuggestions()`, is exported from the same subpath and needs no DOM.

## `<top-button>`

A back-to-top button that appears when the reader scrolls back up a long page. It stays `inert` while hidden, and does no work while the host is `display: none`.

```astro
<top-button inert={true} target="#main-content">
	<button aria-label="Back to top" type="button">
		↑
	</button>
</top-button>

<script>
	import { defineTopButton } from '@xsynaptic/web-components/top-button';

	defineTopButton();
</script>
```

```css
top-button {
	translate: 0 150%;
	transition: translate 200ms ease-out;
}

top-button:not([inert]) {
	translate: 0 0;
}
```

`target` is focused after scrolling. A click first fires `top-button:activate` (cancelable, with `detail.focusTarget`).

## `<progress-loading>` and `<progress-reading>`

Both bars set `--progress` (0 to 1) and `data-active` while they should show.

`<progress-loading>` tracks `<ClientRouter />` navigations slower than 200 ms and needs `transition:persist`. `<progress-reading>` tracks the reader through `target` (default `[data-reading-frame]`), counting `scroll-padding-top` as covered.

```astro
<progress-loading
	aria-hidden="true"
	class="progress-bar"
	transition:persist="progress-loading"
></progress-loading>
<progress-reading aria-hidden="true" class="progress-bar" target="article"></progress-reading>

<script>
	import { defineProgressLoading } from '@xsynaptic/web-components/progress-loading';
	import { defineProgressReading } from '@xsynaptic/web-components/progress-reading';

	defineProgressLoading();
	defineProgressReading();
</script>
```

Delay the fade on the base rule and clear the delay on `[data-active]`, or it also holds back the fade-in:

```css
.progress-bar {
	opacity: 0;
	transform: scaleX(var(--progress, 0));
	transform-origin: 0;
	transition:
		opacity 150ms ease-in 300ms,
		transform 300ms ease-out;
}

.progress-bar[data-active] {
	opacity: 1;
	transition-delay: 0s;
}
```

## License

[MIT](https://opensource.org/licenses/MIT)
