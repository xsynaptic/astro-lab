# @xsynaptic/rehype-wrap-cjk

## 3.0.0

### Major Changes

- 28cd802: Rename to the `@xsynaptic` scope (formerly published unscoped as `rehype-wrap-cjk`) and remove the default export. Import the named `rehypeWrapCjk` export instead of a default import. First release under the new scope; the major bump continues the lineage from unscoped `2.1.2` and signals the breaking export change.

### Patch Changes

- 28cd802: Always clone the matching regex so a caller-supplied global `RegExp` no longer carries its `lastIndex` into the plugin. Previously, reusing a stateful regex could cause leading CJK runs to be skipped.
