# @xsynaptic/satteri-auto-import

A [Sätteri][] mdast plugin that injects ESM `import` statements into MDX at compile time, so
components can be used in `.mdx` files without importing them in every file. It is the Sätteri port
of [`@xsynaptic/remark-auto-import`][remark-auto-import].

## How it works

Sätteri has no `root` visitor, so the plugin is a factory that subscribes to every block-level node
type and, on the first block it visits, injects the import with `ctx.insertBefore`. Sätteri walks
the tree in document order (parent before child), so the first block visited is the document's first
root child, and the import lands as a top-level statement that MDX hoists. Plain `.md` is left
untouched.

## Install

```sh
npm install @xsynaptic/satteri-auto-import
```

This package is ESM-only.

## Use

```ts
import { satteri } from '@astrojs/markdown-satteri';
import { autoImport } from '@xsynaptic/satteri-auto-import';

export default defineConfig({
	markdown: {
		processor: satteri({
			mdastPlugins: [
				autoImport({
					imports: [{ './src/components/mdx/img.astro': [['default', 'Img']] }],
				}),
			],
		}),
	},
});
```

## Config

`imports` is an array; each entry takes one of three forms (validated with [Zod][], so bad config
throws at setup):

| Form            | Example                                             | Emits                                                                 |
| --------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| Bare string     | `'./img.astro'`                                     | `import Img from './img.astro';` (name PascalCased from the filename) |
| Namespace alias | `{ './img.astro': 'Ns' }`                           | `import * as Ns from './img.astro';`                                  |
| Named imports   | `{ './img.astro': [['default', 'Img'], 'helper'] }` | `import { default as Img, helper } from './img.astro';`               |

Relative paths are resolved against the working directory; bare specifiers (npm packages) are left
as-is.

## License

[MIT][mit-license]

[Sätteri]: https://github.com/bruits/satteri
[Zod]: https://github.com/colinhacks/zod
[remark-auto-import]: https://github.com/xsynaptic/astro-lab/tree/main/packages/remark-auto-import
[mit-license]: https://opensource.org/licenses/MIT
