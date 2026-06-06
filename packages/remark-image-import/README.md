# @xsynaptic/remark-image-import

A remark plugin that rewrites string image sources on a component into ESM imports, so local images used in MDX go through Astro's asset optimization pipeline without a hand-written `import` per file.

In Astro a local image is only optimized when it's imported as `ImageMetadata`. A bare `src="./photo.jpg"` string on a custom component is passed through untouched. This plugin finds those, generates the imports, and rewrites the attribute to reference them.

Add it to the `unified()` markdown processor; MDX inherits the processor's remark plugins automatically, so no separate integration is needed.

## Usage

```js
import { unified } from '@astrojs/markdown-remark';
import { remarkImageImport } from '@xsynaptic/remark-image-import';

export default defineConfig({
	markdown: {
		processor: unified({
			remarkPlugins: [remarkImageImport()],
		}),
	},
});
```

It transforms this:

```mdx
<Img src="./photo.jpg" />
<Img src="./photo.jpg" />
```

into this:

```text
import Img1 from "./photo.jpg";

<Img src={Img1} />

<Img src={Img1} />
```

Identical paths share one import. Remote URLs (`http...`) and data URIs are left as plain strings, since they can't be imported.

## Options

| Option         | Default | Description                                                        |
| -------------- | ------- | ------------------------------------------------------------------ |
| `componentId`  | `'Img'` | The JSX component whose `src` attribute is rewritten.              |
| `defaultPath`  | `'./'`  | Prepended to bare `src` values that don't already carry a path.    |
| `importPrefix` | `'Img'` | Prefix for the generated import identifiers (`Img1`, `Img2`, ...). |

The component receiving `src` must accept `ImageMetadata` (e.g. a wrapper around `astro:assets`'s `<Image>`).

## License

[MIT](./LICENSE)
