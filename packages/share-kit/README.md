# @xsynaptic/share-kit

A `<share-kit>` custom element that opens a share dialog for the current page. Pick a destination like Bluesky, Threads or Instagram, and the dialog trims your caption to that platform's length limit, suggests an image in the right shape, and opens the platform's composer or your device's share sheet. It works without a framework.

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
	import {
		defineShareKit,
		shareKitActionEventName,
		shareKitInterfaceIcons,
	} from '@xsynaptic/share-kit';
	import { siBluesky, siThreads } from 'simple-icons';

	document.addEventListener(shareKitActionEventName, ({ detail }) => console.log(detail));
	defineShareKit({
		icons: {
			...shareKitInterfaceIcons,
			bluesky: siBluesky.path,
			threads: siThreads.path,
		},
	});
</script>
```

Every action in the dialog fires a `share-kit:action` event. Listen in the same script as `defineShareKit()`, before or after the call.

If `settings.openHash` matches the URL hash, the dialog opens on load. Pick a fragment that no element id on the page uses, or the page also scrolls there.

`strings` in the payload overrides the dialog's wording by key (`ShareKitStringKey`).

The dialog downloads the images in `assets` to save, copy or share them, so serve them from the same origin or with CORS headers.

## Icons

The package ships no brand icons. Pass the ones you show to `defineShareKit({ icons })` as 24×24 SVG path data, keyed by destination id or by `close`, `more` and `qr`. A missing icon falls back to text. Only the first call counts.

`shareKitInterfaceIcons` holds the five drawn for this package: `any`, `close`, `messages`, `more` and `qr`. For brand marks, [Simple Icons](https://simpleicons.org) exports each one as `si<Name>` with its path on `.path`, and its current release has every destination but LinkedIn.

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

MIT.
