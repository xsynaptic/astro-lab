# @xsynaptic/satteri-img-group

A [Sätteri][] mdast plugin for MDX that backs a pair of components, `<Img>` and `<ImgGroup>`. Because MDX renders inside-out, an `<ImgGroup>` can't pass props to its `<Img>` children at render time, so this plugin stamps what they need at the mdast stage, and throws on invalid authoring to fail the build.

A group carries two independent attributes, both declared in config:

- `context`: how the group arranges its children. This is the one fact a child can't derive on its own, so the plugin copies it from the group onto every `<Img>`. The keys of `contexts` are the vocabulary, so grid, masonry, carousel, or anything else is a config edit.
- `layout`: how far the group escapes the text column. The plugin validates membership and otherwise passes it through; width is the component's business.

The group is also stamped with `imageCount`.

## Usage

```ts
imgGroupSatteriPlugin({
	defaultContext: 'grid',
	contexts: {
		grid: {},
		masonry: {},
		carousel: { minImages: 2, disallowedAttributes: ['columns'] },
	},
	layouts: ['default', 'wide', 'full'],
});
```

```mdx
<ImgGroup>                                  {/* grid, default width */}
<ImgGroup layout="wide">                    {/* grid, wide */}
<ImgGroup context="masonry" layout="wide">  {/* masonry, wide */}
<ImgGroup context="carousel" layout="full"> {/* carousel, full-bleed */}
```

## Options

`contexts`, `defaultContext`, and `layouts` are required; there is no built-in vocabulary. Each context takes `minImages` (default `1`) and `disallowedAttributes` (default `[]`), which throw when violated.

The rest are naming overrides, useful if your components differ: `contextAttributeName` (`context`), `layoutAttributeName` (`layout`), `imageCountAttributeName` (`imageCount`), `imgComponentId` (`Img`), and `imgGroupComponentId` (`ImgGroup`).

## Rules that always apply

- An `<ImgGroup>` may only contain `<Img>` children, and may not be empty.
- An `<Img>` inside a group may not set `context` or `layout`; the group owns both.

## License

[MIT][mit-license]

[Sätteri]: https://github.com/bruits/satteri
[mit-license]: https://opensource.org/licenses/MIT
