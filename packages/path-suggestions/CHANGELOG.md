# @xsynaptic/path-suggestions

## 0.2.0

### Minor Changes

- Forward `link-*` attributes to the rendered anchors, replacing `link-class`. Defer the first run by a microtask so a host can attach listeners first. Declare both events on `DocumentEventMap` and `HTMLElementEventMap`.

## 0.1.0

### Minor Changes

- Initial release. A helper utility for 404 pages: scores the path a visitor asked for against the paths that actually exist, then lists the closest matches or redirects outright when one scores high enough. Ships as a DOM-free scoring function plus an optional custom element.
