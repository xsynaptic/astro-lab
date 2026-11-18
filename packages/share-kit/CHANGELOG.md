# @xsynaptic/share-kit

## 0.6.0

### Minor Changes

- Drop the More button: `settings.destinations` is now the only list, so merge `destinationsMore` into it, and remove the `more` icon and string from your overrides. Buttons show a press, and a copy button's own Copied label is no longer repeated in the footer.

## 0.5.0

### Minor Changes

- Rework the dialog's layout and wording:

  - The text field is called Text, or Title for Reddit, and disappears for Story, where the link is the whole post
  - The link row comes last, copies the link tagged for the chosen destination, and holds the QR code behind an Open on phone button
  - On a computer, Instagram and Story save the suggested image and copy the text
  - Mastodon opens its official share page, which asks for the reader's server
  - Help lines say what the reader has to do next, including one for the images
  - A trigger can open the dialog on a chosen destination, and a dialog with one destination drops the destination row
  - When several dialogs share an open hash, only the first opens
  - The destination row wraps on wide screens and scrolls under a fade on narrow ones
  - Smaller fixes: Reset appears only after an edit, the counter shows how far over the limit the text is, images offer Share only on phones, image labels sit above the images, and the default blue is softer

  Some wording keys are renamed or added, so check any strings you override, and drop the QR icon from your icons, since nothing uses it now.

## 0.4.0

### Minor Changes

- `share-kit:action` now fires when a share or save finishes, with an `outcome` that says how it went. LINE is built in as `shareKitLine`. Copy link moves up under the caption. X captions count a bare domain like `example.com` as a link, as X does.

## 0.3.0

### Minor Changes

- Hosts register their destinations, built-in or their own, through `defineShareKit({ destinations })`; images carry an `id` in place of `role`, the `data-can` token `handheld` is now `mobile`, and icons can load lazily

## 0.2.1

### Patch Changes

- Mastodon captions count an emoji sequence as one character, as Mastodon's composer does

## 0.2.0

### Minor Changes

- `defineShareKit` no longer bundles brand icons: pass the ones you show, plus `shareKitInterfaceIcons` for the dialog's own
- A hash-opened dialog's `open` event now reaches listeners added after `defineShareKit()`, and `shareKitStringDefaults` is no longer exported

## 0.1.0

### Minor Changes

- Initial release
