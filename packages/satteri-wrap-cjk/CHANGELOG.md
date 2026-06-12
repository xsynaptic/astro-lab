# @xsynaptic/satteri-wrap-cjk

## 0.1.1

### Patch Changes

- Fix `wrapCjk` being typed as an asynchronous plugin. The explicit `HastPluginInput` return annotation permitted `Promise`-returning visitors, which made satteri infer a `Promise` result for `markdownToHtml`/`mdxToJs` whenever the plugin was passed via `hastPlugins`. The return type is now inferred from the synchronous visitors, so callers get a synchronous result. No runtime change.

## 0.1.0

### Minor Changes

- Initial release: Sätteri mdast/hast plugins ported from the unified originals. `satteri-auto-import`
  injects ESM imports into MDX, `satteri-wrap-cjk` wraps CJK character runs, and `satteri-img-group`
  stamps `<ImgGroup>`/`<Img>` layout context.
