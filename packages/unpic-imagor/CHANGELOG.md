# @xsynaptic/unpic-imagor

## 1.0.0

### Major Changes

- First stable release. No API changes: the public surface is now covered by semver, so patches and minor releases reach a `^1.0.0` range without a manual bump.

  The Sätteri plugins stay on `0.x` until Sätteri itself reaches 1.0.

## 0.2.0

### Minor Changes

- Align `generate` output with imagor's URL grammar so the result is a complete, servable URL.

  Breaking: `generate` now emits imagor's `unsafe` form by default (`unsafe/800x0/photo.jpg`) and prepends `baseURL` when set. To get the previous bare, signable path, pass `{ unsafe: false }`. `extract` now drops a leading `unsafe` segment so round-trips stay balanced.

  This mirrors the provider being submitted upstream to `unpic`. Consumers that sign URLs themselves should call `generate(src, operations, { unsafe: false })`; the bare output is byte-identical to before, so existing signatures stay valid.
