# @xsynaptic/rehype-wrap-cjk

This package is a [unified][]/[rehype][] plugin that wraps [CJK character][cjk-wiki] sequences in an element (defaulting to `span`) with a configurable attribute and value, useful for applying different CSS styling rules in multilingual contexts.

By default it emits `<span class="cjk">...</span>` as a pure styling hook. To emit semantic `lang` tags instead, pass `attribute: 'lang'` together with a `value` such as `'zh'`, `'ja'`, or `'ko'`. Custom attribute names (e.g. `data-lang`) are also supported.

_Note_: this package is ESM-only. It was formerly published unscoped as `rehype-wrap-cjk`; the default export has been removed in favor of the named `rehypeWrapCjk` export.

## Install

```sh
npm install @xsynaptic/rehype-wrap-cjk
```

## Use

A typical pipeline transforming Markdown into HTML with [remark][] and [rehype][]:

```ts
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { rehypeWrapCjk } from '@xsynaptic/rehype-wrap-cjk';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

export function processMarkdown(markdownContent: string): string {
	const htmlOutput = unified()
		.use(remarkParse)
		.use(remarkRehype)
		.use(rehypeWrapCjk)
		.use(rehypeSanitize)
		.use(rehypeStringify)
		.processSync(markdownContent);

	return String(htmlOutput);
}
```

Example plain text input:

```text
Sample text with CJK characters (中日韓字符) interspersed. 中文 can appear anywhere in the text and will be appropriately wrapped.
```

Example HTML output (default `class="cjk"` styling hook):

```html
Sample text with CJK characters (<span class="cjk">中日韓字符</span>) interspersed.
<span class="cjk">中文</span> can appear anywhere in the text and will be appropriately wrapped.
```

Example CSS rules (for you to implement in your own projects):

```css
.cjk {
	font-style: normal !important;
	text-decoration: none !important;
	word-break: keep-all !important;
}
```

## Options

Pass options as the second argument to `.use(rehypeWrapCjk, { ... })`.

- `element` (default `'span'`): wrapper element name.
- `attribute` (default `'class'`): attribute written to the wrapper. Use `'lang'` for semantic language tagging, `'class'` for a styling hook, or any other attribute name (e.g. `'data-lang'`).
- `value` (default `'cjk'`): value written to `attribute`. Also selects a preset regex when set to `'zh'`, `'ja'`, `'ko'`, or `'cjk'`.
- `regex` (default derived from `value`): custom pattern. The `g` flag is added if missing.
- `skipTags` (default `['code', 'pre', 'kbd', 'samp', 'script', 'style']`): elements whose descendants are left alone. Pass `[]` to disable.

Text inside any ancestor that already carries the target `attribute`/`value` is not re-wrapped.

## Reference

- [CJK Unified Ideographs][cjk-unified-ideographs]
- [CJK Ideographs in Unicode][cjk-ideographs-in-unicode]
- [Halfwidth and Fullwidth Forms][halfwidth-and-fullwidth-forms]
- [HTMLElement lang property][html-element-lang-property]
- [word-break CSS property][wordbreak-css-property]

## License

[MIT][mit-license]

[cjk-wiki]: https://en.wikipedia.org/wiki/CJK_characters
[cjk-unified-ideographs]: https://en.wikipedia.org/wiki/CJK_Unified_Ideographs
[cjk-ideographs-in-unicode]: https://en.wikipedia.org/wiki/Template:CJK_ideographs_in_Unicode
[halfwidth-and-fullwidth-forms]: https://en.wikipedia.org/wiki/Halfwidth_and_Fullwidth_Forms_(Unicode_block)
[html-element-lang-property]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/lang
[mit-license]: https://opensource.org/licenses/MIT
[rehype]: https://github.com/rehypejs/rehype
[remark]: https://github.com/remarkjs/remark
[unified]: https://github.com/unifiedjs/unified
[wordbreak-css-property]: https://developer.mozilla.org/en-US/docs/Web/CSS/word-break
