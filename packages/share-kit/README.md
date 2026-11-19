# @xsynaptic/share-kit

A `<share-kit>` custom element that opens a share dialog for the current page. Pick a destination like Bluesky, Threads or Instagram, and the dialog trims your caption to that platform's length limit, suggests an image in the right shape, and opens the platform's composer or your device's share sheet. It works without a framework.

## Usage

```sh
npm install @xsynaptic/share-kit
```

List your destinations in a module that server and client code both import:

```ts
// src/lib/share-destinations.ts
import type { ShareKitDestinationIdOf } from '@xsynaptic/share-kit';

import {
	shareKitAnywhere,
	shareKitBluesky,
	shareKitMastodon,
	shareKitThreads,
	shareKitX,
} from '@xsynaptic/share-kit';

export const destinations = [
	shareKitAnywhere,
	shareKitBluesky,
	shareKitThreads,
	shareKitX,
	shareKitMastodon,
] as const;

export type Destination = ShareKitDestinationIdOf<typeof destinations>;
```

Put a trigger button and a JSON payload inside the element. The button starts out `disabled`, and the element enables it once its script loads. Write the payload with `serializeShareKitPayload`, which escapes `<` so a title can't break out of the script tag.

```astro
---
import { serializeShareKitPayload, type ShareKitPayload } from '@xsynaptic/share-kit';

import type { Destination } from '../lib/share-destinations';

const payload: ShareKitPayload<Destination> = {
	assets: [],
	description: 'On foggy nights the cat follows the keeper up the tower.',
	locale: 'en',
	settings: { destinations: ['any', 'bluesky', 'threads', 'x', 'mastodon'] },
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

	import { destinations } from '../lib/share-destinations';

	document.addEventListener(shareKitActionEventName, ({ detail }) => console.log(detail));
	defineShareKit({
		destinations,
		icons: {
			...shareKitInterfaceIcons,
			bluesky: siBluesky.path,
			threads: siThreads.path,
		},
	});
</script>
```

Every action in the dialog fires a `share-kit:action` event whose `detail` holds the `action`, the selected `destination` and, for an image, its `asset` id. Listen in the same script as `defineShareKit()`, before or after the call.

Sharing and saving fire once they finish, with an `outcome`:

- `share`: `shared`, `dismissed`, `retry` (a slow download used up the tap), `saved` (the browser refused the file, so it downloaded instead) or `error`
- `share-link`, `share-text`: `shared`, `dismissed` or `error`
- `save`: `saved` or `error`

`shared` means the share sheet took it, not that it was posted.

A trigger can name a destination, as in `data-share-kit-trigger="instagram"`, to open the dialog with it selected. With a single destination, the dialog leaves out the destination row.

If `settings.openHash` matches the URL hash, the dialog opens on load. Pick a fragment that no element id on the page uses, or the page also scrolls there. When several elements share one, only the first on the page opens.

`strings` in the payload overrides the dialog's wording by key, including `destination.<id>` and `hint.<id>`. `ShareKitStringKey` lists the interface keys, and `ShareKitDestinationStringKey<typeof destinations>` lists the destination keys that have English text: each label, and each hint. `ShareKitDestinationHintKey` lists just the hints.

## Destinations

The built-ins are `shareKitAnywhere`, `shareKitBluesky`, `shareKitFacebook`, `shareKitInstagram`, `shareKitInstagramStory`, `shareKitLine`, `shareKitLinkedin`, `shareKitMastodon`, `shareKitPinterest`, `shareKitReddit`, `shareKitThreads` and `shareKitX`. Adjust one by spreading it (`{ ...shareKitMastodon, limit: 1000 }`), or write your own with `defineShareKitDestination`:

```ts
export const email = defineShareKitDestination({
	actions: { desktop: ['open-composer'], mobile: ['open-composer'] },
	composer: ({ text, title }) =>
		`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`,
	count: shareKitCountLength,
	id: 'email',
	images: [shareKitLandscapeFormat],
	label: 'Email',
	shape: 'full',
});
```

`actions` is what the main button tries on each device, in order, before falling back to copying the caption. `images` lists the formats the destination takes, best first.

## Images

Each entry in `assets` has an `id`, `width` and `height`; spread a preset such as `shareKitPortraitFormat` into a card to get all three. Photos set `isSuggestable: false`. `getShareKitImageFormats(destinations)` lists the card formats worth rendering.

The dialog downloads the images in `assets` to save, copy or share them, so serve them from the same origin or with CORS headers.

## Icons

The package ships no brand icons. Pass the ones you show to `defineShareKit({ icons })` as 24×24 SVG path data, keyed by destination id or by `close`, or pass a function that returns a promise of that map to load them lazily. `shareKitInterfaceIcons` holds the two drawn for this package; without them Close shows `×` and Anywhere shows no icon. For brand marks, [Simple Icons](https://simpleicons.org) has every built-in but LinkedIn.

## Styles

```css
@import '@xsynaptic/share-kit/styles.css';
```

The dialog doesn't use a shadow root, so your CSS can reach it. If any of your CSS uses cascade layers (Tailwind 4 does), import this into a sublayer of your components layer, as in `layer(components.share-kit)`. Rules placed directly in a layer outrank its sublayers, so your component classes and utilities win over the dialog's defaults whatever their specificity, with no layer order to declare. Otherwise import it unlayered, before your own styles. Keep the element out of containers like `.prose` that style every `p` or `button` inside them.

Restyle it with rules on its `share-kit-*` classes, or set its `--share-kit-*` custom properties on `share-kit` or any ancestor; `styles.css` lists both.

## Testing

The element checks what the browser supports: sharing files (`files`), sharing links (`link`), copying images (`copy-image`) and whether it is a phone or tablet, whose share sheet reaches installed apps (`mobile`, from touch input). To preview another device, list the features you want in `data-can`, for example `<share-kit data-can="files link mobile">` for a phone.

## Browser support

Chrome 122, Safari 17.4 and Firefox 125 or later.

## License

MIT.
