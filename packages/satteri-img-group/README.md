# @xsynaptic/satteri-img-group

A [Sätteri][] mdast plugin for MDX, specific to the [Spectral Codex][spectralcodex] project. It backs
a pair of bespoke MDX components, `<Img>` and `<ImgGroup>`, that are not part of any shared library.
Because MDX renders inside-out, an `<ImgGroup>` can't pass props to its `<Img>` children at render
time, so this plugin stamps the `context` (`grid`/`carousel`) and `imageCount` they need at the mdast
stage, and throws on invalid authoring to fail the build, matching the unified original's `file.fail()`.

This is the live plugin Spectral Codex runs; the unified reference implementation is
[`@xsynaptic/remark-img-group`][remark-img-group].

A single `layout` attribute on the `<ImgGroup>` encodes both mode and width:

| `layout`         | mode     | width      |
| ---------------- | -------- | ---------- |
| `default` (omit) | grid     | default    |
| `wide`           | grid     | wide       |
| `carousel`       | carousel | default    |
| `carousel-wide`  | carousel | wide       |
| `carousel-full`  | carousel | full-bleed |

## License

[MIT][mit-license]

[Sätteri]: https://github.com/bruits/satteri
[remark-img-group]: https://github.com/xsynaptic/astro-lab/tree/main/packages/remark-img-group
[spectralcodex]: https://spectralcodex.com
[mit-license]: https://opensource.org/licenses/MIT
