---
"@xsynaptic/rehype-wrap-cjk": patch
---

Always clone the matching regex so a caller-supplied global `RegExp` no longer carries its `lastIndex` into the plugin. Previously, reusing a stateful regex could cause leading CJK runs to be skipped.
