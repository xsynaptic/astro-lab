# @xsynaptic/satteri-img-group

## 2.0.0

### Major Changes

- Require satteri `^0.10.0`. Opts into `position` tracking, now per-plugin, restoring source locations in validation errors.

## 1.0.0

### Major Changes

- Move the group vocabulary out of the plugin and into options, split across the two axes it always was.

  `layout` used to encode both arrangement mode and width as a single flattened enum (`carousel-wide` and friends), hardcoded in the package. It is now two independent attributes, both declared by the consumer:

  - `contexts` (required) maps a context name to its rules; the keys are the vocabulary. `defaultContext` (required) names the fallback.
  - `layouts` (required) lists accepted `layout` values, which now mean width only.

  The carousel special-casing is gone, replaced by per-context `minImages` and `disallowedAttributes`. The group is now stamped with `context` alongside `imageCount`, and an `<Img>` inside a group that sets its own `context` throws, matching the existing rule for `layout`.

  Breaking changes:

  - `contexts`, `defaultContext`, and `layouts` are required, so a no-argument call no longer compiles.
  - `columnsAttributeName` is removed; use `disallowedAttributes: ['columns']` on the contexts that reject it.
  - `<ImgGroup layout="carousel">` becomes `<ImgGroup context="carousel">`; `carousel-wide` and `carousel-full` become `context` plus `layout`.

## 0.2.1

### Patch Changes

- Support `satteri@^0.9.0`.

## 0.2.0

### Minor Changes

- Throw on invalid `<ImgGroup>` authoring (with source position) instead of emitting a non-blocking diagnostic, so content mistakes fail the build, matching the unified `@xsynaptic/remark-img-group`. Also fixes a `TypeError` on an empty group, which now throws the "contains no `<Img>` children" error.

## 0.1.0

### Minor Changes

- Initial release: Sätteri mdast/hast plugins ported from the unified originals. `satteri-auto-import` injects ESM imports into MDX, `satteri-wrap-cjk` wraps CJK character runs, and `satteri-img-group` stamps `<ImgGroup>`/`<Img>` layout context.
