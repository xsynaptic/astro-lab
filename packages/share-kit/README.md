# @xsynaptic/share-kit

A `<share-kit>` custom element that opens a share dialog for the current page. Pick a destination like Bluesky, Threads or Instagram, and the dialog trims your caption to that platform's length limit, suggests an image in the right shape, and opens the platform's composer or your device's share sheet. It works without a framework.

This is an early release, and the API will change.

## Usage

```sh
npm install @xsynaptic/share-kit
```

Put a trigger button and a JSON payload inside the element. The button starts out `disabled`, and the element enables it once its script loads. Write the payload with `serializeShareKitPayload`, which escapes `<` so a title can't break out of the script tag.

```astro
---
import { serializeShareKitPayload, type ShareKitPayload } from '@xsynaptic/share-kit';

const payload: ShareKitPayload = {
	assets: [],
	description: 'On foggy nights the cat follows the keeper up the tower.',
	locale: 'en',
	settings: { destinations: ['any', 'bluesky', 'threads'], destinationsMore: ['x', 'mastodon'] },
	title: "The Lighthouse Keeper's Cat",
	url: 'https://example.com/lighthouse-keepers-cat/',
};
---

<share-kit>
	<button data-share-kit-trigger disabled={true} type="button">
		Share
	</button>
	<script is:inline set:html={serializeShareKitPayload(payload)} type="application/json" />
</share-kit>

<script>
	import { defineShareKit, shareKitActionEventName } from '@xsynaptic/share-kit';

	document.addEventListener(shareKitActionEventName, ({ detail }) => console.log(detail));
	defineShareKit();
</script>
```

Every action in the dialog fires a `share-kit:action` event. Add your listeners before calling `defineShareKit()`. If `settings.openHash` matches the URL hash, the dialog opens straight away and you would miss that first event.

`defineShareKit({ icons })` swaps in your own icons as 24×24 SVG path data. Only the first call counts.

The dialog downloads the images in `assets` to save, copy or share them, so serve them from the same origin or with CORS headers.

## Styles

```css
@import '@xsynaptic/share-kit/styles.css';
```

The dialog doesn't use a shadow root, so your CSS can reach it. If your stylesheets use cascade layers, import this one into an early layer, for example `layer(components)`, so classes you pass in `settings.classNames` take priority. If they don't, import it without a layer. A layered import would lose to every plain rule on your page. Also keep the element out of containers like `.prose` that style every `p` or `button` inside them.

To change colours and spacing, set custom properties on `share-kit` or a parent. Each name starts with `--share-kit-` and ends with one of `surface`, `text`, `muted`, `border`, `field`, `accent`, `accent-text`, `hover`, `hover-border`, `danger`, `radius`, `gap`, `shadow` or `font-mono`.

## Testing

The element checks what the browser supports: sharing files (`files`), sharing links (`link`), copying images (`copy-image`) and touch input (`handheld`). To preview another device, list the features you want in `data-can`, for example `<share-kit data-can="files link handheld">` for a phone.

## Browser support

Chrome 120, Safari 17.2 and Firefox 125 or later.

## License

MIT. The brand icons come from [Simple Icons](https://simpleicons.org) and are in the public domain (CC0). The LinkedIn and Threads icons are from Simple Icons 13.0.0, since newer releases removed LinkedIn and redrew Threads.
