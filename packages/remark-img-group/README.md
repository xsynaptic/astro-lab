# @xsynaptic/remark-img-group

A remark plugin for MDX, specific to the [Spectral Codex][spectralcodex] project. It backs a pair of
bespoke MDX components, `<Img>` and `<ImgGroup>`, that are not part of any shared library. Because
MDX renders inside-out, an `<ImgGroup>` can't pass props to its `<Img>` children at render time, so
this plugin stamps the `context` (`grid`/`carousel`) and `imageCount` they need at the mdast stage,
and fails the build on invalid authoring.

This is the unified reference implementation; the live build runs the Sätteri port,
[`@xsynaptic/satteri-img-group`][satteri-img-group].

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

[satteri-img-group]: https://github.com/xsynaptic/astro-lab/tree/main/packages/satteri-img-group
[spectralcodex]: https://spectralcodex.com
[mit-license]: https://opensource.org/licenses/MIT
