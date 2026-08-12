# @xsynaptic/remark-prose-rules

Checks prose for missing diacritics and off-style terminology, in the remark pipeline, so problems show up in the editor with a suggested fix rather than only in a batch run.

Three rules ported from textlint ([diacritics](https://github.com/sapegin/textlint-rule-diacritics), [terminology](https://github.com/sapegin/textlint-rule-terminology), [pattern](https://github.com/textlint-rule/textlint-rule-pattern), MIT, Artem Sapegin). Not a textlint replacement: no rule ecosystem, no default terminology list, no suppression comments. ESM-only.

```js
import { diacriticsMarks, diacriticsWords, remarkProseRules } from '@xsynaptic/remark-prose-rules';

remarkProseRules({
	// Correct spellings; the misspellings are worked out from them, and casing is kept
	words: [...diacriticsWords, 'mañana'],
	// Letters a spelling may be missing its mark on, plain letter last
	marks: [...diacriticsMarks, 'ōo'],
	// Case-insensitive, and skipped inside a longer word like `postwar-era`
	terms: [['metre', 'meter']],
	// Plain regex with a $n replacement
	patterns: [{ message: 'Use `--` for ranges', pattern: '(\\d)-(\\d)', replace: '$1--$2' }],
	// Nothing inside these is checked
	skip: ['blockquote'],
	// Frontmatter fields to check; `true` reuses the list above, an array replaces it
	frontmatter: { title: { words: true }, 'links[].title': { terms: [['metre', 'meter']] } },
});
```

Every option is empty by default, so nothing is corrected until asked for. All the rules share one `skip` list; to scope them differently, add a second instance with its own options.

Only body text is checked, so code, URLs and JSX attributes are left alone. Frontmatter needs `remark-frontmatter` and is checked only for the fields listed above, where a dot goes into a nested field and `[]` covers every item of a list. Those fields are edited in place, and a quoted value is reported but never changed.

Only spellings that need a mark from `marks` can be corrected, and passing `marks` replaces the built-in groups rather than adding to them. Anything transliterated, like Japanese or pinyin, is better handled by `terms`, which suggests instead of rewriting.

`words` and `patterns` fix as they go, while `terms` only reports, unless the processor carries `data('editorialFixes', true)`. That keeps wording changes out of format-on-save. Fixes reach the file only if the pipeline ends in `remark-stringify` and the result is written back; behind an HTML compiler they fix the page and leave the file wrong.

[MIT](./LICENSE)
