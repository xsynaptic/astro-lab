# @xsynaptic/satteri-reading-time

A [Sätteri][] mdast plugin that estimates reading time and injects it into Astro's frontmatter, so
pages can read it back through `remarkPluginFrontmatter`. A multilingual-aware take on Astro's
official [reading time recipe][recipe], built for Astro 7 and the Sätteri markdown pipeline.

## How it works

Word counting is delegated to [`@xsynaptic/word-count`][word-count], which splits text into
whitespace-delimited words (Latin, Korean, …) and per-character-script units (CJK, Japanese kana,
Thai, etc.). Each class is converted to minutes at its own rate and summed, so mixed-script content is
estimated fairly rather than counting ideographs as if they were words:

```
minutes = ceil(words / latinWpm + scriptChars / scriptCharPerMinute)
```

### What counts

- Prose, headings, and text inside custom MDX components are counted.
- Inline code is counted; fenced code blocks are excluded unless `countCodeBlocks` is set.
- Image alt text, raw HTML markup, component attributes, imports, expressions, and frontmatter are
  not counted.
- The estimate comes from the source, not rendered output, so a self-closing component (`<Embed />`)
  contributes nothing regardless of what it renders.

## Install

```sh
npm install @xsynaptic/satteri-reading-time
```

This package is ESM-only.

## Use

Wire it into the Sätteri processor as an mdast plugin:

```ts
import { satteri } from '@astrojs/markdown-satteri';
import { readingTime } from '@xsynaptic/satteri-reading-time';
import { defineConfig } from 'astro/config';

export default defineConfig({
	markdown: {
		processor: satteri({ mdastPlugins: [readingTime()] }),
	},
});
```

Read the value back through `remarkPluginFrontmatter`. From a content collection:

```astro
---
import { render } from 'astro:content';

const { remarkPluginFrontmatter } = await render(entry);
---

<p>{remarkPluginFrontmatter.minutesRead} min read</p>
```

Or from a directly imported `.mdx` page, the injected value is merged into the module's
`frontmatter` export:

```astro
---
import Post, { frontmatter } from '../post.mdx';
---

<p>{frontmatter.minutesRead} min read</p>
```

A document with no countable prose (frontmatter only, or nothing but an image) leaves the key unset,
so treat a missing value as "no reading time."

## Options

| Option                | Default         | Purpose                                                               |
| --------------------- | --------------- | --------------------------------------------------------------------- |
| `frontmatterKey`      | `'minutesRead'` | Frontmatter key the estimate is written to.                           |
| `latinWpm`            | `200`           | Words per minute for whitespace-delimited scripts (Latin, Korean, …). |
| `scriptCharPerMinute` | `300`           | Characters per minute for per-character scripts (CJK, kana, Thai, …). |
| `countCodeBlocks`     | `false`         | Include fenced code block contents in the estimate.                   |

A single `scriptCharPerMinute` covers every space-free script, so it is an approximation for the
non-CJK ones (Thai is read at a difference pace). Calibrate it for the mix of languages in your content.

## License

[MIT][mit-license]

[Sätteri]: https://github.com/bruits/satteri
[recipe]: https://docs.astro.build/en/recipes/reading-time/
[word-count]: https://github.com/xsynaptic/astro-lab/tree/main/packages/word-count
[mit-license]: https://opensource.org/licenses/MIT
