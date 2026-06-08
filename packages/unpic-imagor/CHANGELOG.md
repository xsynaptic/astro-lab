# @xsynaptic/unpic-imagor

## 0.2.0

### Minor Changes

- Align `generate` output with imagor's URL grammar so the result is a complete, servable URL.

  Breaking: `generate` now emits imagor's `unsafe` form by default (`unsafe/800x0/photo.jpg`) and prepends `baseURL` when set. To get the previous bare, signable path, pass `{ unsafe: false }`. `extract` now drops a leading `unsafe` segment so round-trips stay balanced.

  This mirrors the provider being submitted upstream to `unpic`. Consumers that sign URLs themselves should call `generate(src, operations, { unsafe: false })`; the bare output is byte-identical to before, so existing signatures stay valid.
