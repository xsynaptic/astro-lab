# @xsynaptic/share-kit

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
