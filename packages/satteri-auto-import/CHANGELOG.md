# @xsynaptic/satteri-auto-import

## 0.2.1

### Patch Changes

- Report the precise return type rather than the wider `MdastPluginInput`, so consumers that type their plugin option narrowly accept these plugins.

## 0.2.0

### Minor Changes

- Require satteri `^0.10.0`. Injects the import from the new `before` hook, reading the document root directly instead of visiting every block-level node type.

## 0.1.1

### Patch Changes

- Support `satteri@^0.9.0`.

## 0.1.0

### Minor Changes

- Initial release: Sätteri mdast/hast plugins ported from the unified originals. `satteri-auto-import` injects ESM imports into MDX, `satteri-wrap-cjk` wraps CJK character runs, and `satteri-img-group` stamps `<ImgGroup>`/`<Img>` layout context.
