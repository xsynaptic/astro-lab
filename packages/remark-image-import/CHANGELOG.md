# @xsynaptic/remark-image-import

## 0.1.0

### Minor Changes

- Add `@xsynaptic/remark-image-import`, a remark plugin that rewrites string `src` values on a configured component into ESM image imports so local images in MDX go through Astro's asset optimization. Repeated paths share one import; remote URLs and data URIs are left as plain strings.
