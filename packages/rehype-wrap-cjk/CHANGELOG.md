# @xsynaptic/rehype-wrap-cjk

## 3.0.1

### Patch Changes

- Look up regex presets by explicit name instead of an `in` check. The previous `settings.value in cjkRegexPresets` test also matched inherited `Object.prototype` keys, so a `value` of `'constructor'`, `'toString'`, etc. would resolve to a function and throw. Lookup now falls back to the `cjk` preset for any unrecognized value.

## 3.0.0

### Major Changes

- 28cd802: Rename to the `@xsynaptic` scope (formerly published unscoped as `rehype-wrap-cjk`) and remove the default export. Import the named `rehypeWrapCjk` export instead of a default import. First release under the new scope; the major bump continues the lineage from unscoped `2.1.2` and signals the breaking export change.

### Patch Changes

- 28cd802: Always clone the matching regex so a caller-supplied global `RegExp` no longer carries its `lastIndex` into the plugin. Previously, reusing a stateful regex could cause leading CJK runs to be skipped.
