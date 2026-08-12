# @xsynaptic/remark-prose-rules

Prose linting inside the remark pipeline, so missing diacritics and off-style terminology surface as live editor diagnostics with quickfixes instead of only at a batch fix run.

Three rules ported from textlint ([diacritics](https://github.com/sapegin/textlint-rule-diacritics), [terminology](https://github.com/sapegin/textlint-rule-terminology), [pattern](https://github.com/textlint-rule/textlint-rule-pattern), MIT, Artem Sapegin). Not a textlint replacement: no rule ecosystem, no default terminology list, no suppression comments, no tokenization. ESM-only.

```js
remarkProseRules({
	// Correct spellings, mistakes derived, casing preserved; extends a built-in list of ~140 words
	words: ['mañana'],
	// Case-insensitive, boundary-guarded (`postwar-era` is skipped), replacement used literally
	terms: [['metre', 'meter']],
	// Unguarded regex with a $n replacement
	patterns: [{ message: 'Use `--` for ranges', pattern: '(\\d)-(\\d)', replace: '$1--$2' }],
	// Ancestor types suppressing every rule
	skip: ['blockquote'],
});
```

Only `text` nodes are visited, so code, URLs and JSX attributes are untouched (frontmatter too, given `remark-frontmatter`). A `terms` replacement is upper-firsted only at a sentence start. `words` derives mistake patterns from correct spellings, but only for the marks `àâäå éèêë ç îí ñ ö š ûü ÿ`, so macrons belong in `terms`.

`words` and `patterns` rewrite the tree; `terms` reports only, until the processor carries `data('editorialFixes', true)`, which keeps editorial substitutions off format-on-save. Mutations reach the source only when the pipeline ends in `remark-stringify` and the result is written back; behind an HTML compiler it fixes the render and leaves the file wrong.

[MIT](./LICENSE)
