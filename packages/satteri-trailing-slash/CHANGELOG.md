# @xsynaptic/satteri-trailing-slash

## 0.1.0

### Minor Changes

- Initial release: Sätteri hast plugin that normalizes trailing slashes on internal markdown links to match an Astro project's `trailingSlash` setting. A single `trailingSlash: 'always' | 'never' | 'ignore'` option (default `'ignore'`, a no-op) rewrites root-relative `<a href>` links, preserving any query or hash suffix and skipping external, protocol-relative, hash-only, `mailto:`/`tel:`, and file-extension links. Requires `satteri@^0.9.0`.
