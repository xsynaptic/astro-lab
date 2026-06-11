# @xsynaptic/satteri-wrap-cjk

A [Sätteri][] hast plugin that wraps runs of [CJK characters][cjk-wiki] in an element (default
`<span class="cjk">`) so they can be styled or language-tagged apart from surrounding Latin text.

## How it works

Sätteri's hast visitor has no ancestor context, so rather than walking up from each text node, the
plugin visits an allowlist of text-bearing elements (and MDX components) and wraps the CJK runs in
their direct text children. Code-like tags (`code`, `pre`, …) are left off the allowlist, so their
text is never reached. Any element or component already carrying the target attribute and value is
skipped, so existing wrappers are never doubled.

## Install

```sh
npm install @xsynaptic/satteri-wrap-cjk
```

This package is ESM-only.

## Use

```ts
import { satteri } from '@astrojs/markdown-satteri';
import { wrapCjk } from '@xsynaptic/satteri-wrap-cjk';

export default defineConfig({
	markdown: {
		processor: satteri({ hastPlugins: [wrapCjk({ value: 'cjk' })] }),
	},
});
```

By default it emits `<span class="cjk">...</span>` as a styling hook. To emit semantic `lang` tags
instead, pass `attribute: 'lang'` together with a `value` such as `'zh'`, `'ja'`, or `'ko'`.

```css
.cjk {
	font-style: normal !important;
	text-decoration: none !important;
	word-break: keep-all !important;
}
```

## Options

| Option      | Default      | Purpose                                                                                  |
| ----------- | ------------ | ---------------------------------------------------------------------------------------- |
| `element`   | `'span'`     | Wrapper element.                                                                         |
| `attribute` | `'class'`    | Attribute on the wrapper. Use `'lang'` for semantic language tags.                       |
| `value`     | `'cjk'`      | Attribute value, and the preset selector when set to `'zh'`, `'ja'`, `'ko'`, or `'cjk'`. |
| `regex`     | from `value` | Custom pattern. The `g` flag is added if missing.                                        |

Presets are built from Unicode Script Extensions (so they track the engine's Unicode version) plus
the full-width ASCII block: `zh` (Han, Bopomofo), `ja` (Hiragana, Katakana, Han), `ko` (Hangul,
Han), `cjk` (all of the above).

## License

[MIT][mit-license]

[Sätteri]: https://github.com/bruits/satteri
[cjk-wiki]: https://en.wikipedia.org/wiki/CJK_characters
[mit-license]: https://opensource.org/licenses/MIT
