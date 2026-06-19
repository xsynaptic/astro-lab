# @xsynaptic/satteri-img-group

## 0.2.1

### Patch Changes

- Support `satteri@^0.9.0`.

## 0.2.0

### Minor Changes

- Throw on invalid `<ImgGroup>` authoring (with source position) instead of emitting a non-blocking diagnostic, so content mistakes fail the build, matching the unified `@xsynaptic/remark-img-group`. Also fixes a `TypeError` on an empty group, which now throws the "contains no `<Img>` children" error.

## 0.1.0

### Minor Changes

- Initial release: Sätteri mdast/hast plugins ported from the unified originals. `satteri-auto-import`
  injects ESM imports into MDX, `satteri-wrap-cjk` wraps CJK character runs, and `satteri-img-group`
  stamps `<ImgGroup>`/`<Img>` layout context.
