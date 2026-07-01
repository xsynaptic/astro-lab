# @xsynaptic/mdxlint-config

Shared [mdxlint][] configuration and a small CLI for formatting and linting MDX content across projects. The config provides healthy remark defaults; the `mdxlint-content` CLI runs mdxlint (and optional [textlint][]) over a content package, writing back only the files that actually change.

_Note_: this package is ESM-only.

## Install

```sh
npm install -D @xsynaptic/mdxlint-config
```

## Use

### Config

Re-export the shared config from a project's `.mdxlintrc.mjs` so both the CLI and the [mdxlint VS Code extension][vscode-mdxlint] read the same rules:

```js
// packages/content/.mdxlintrc.mjs
export { default } from '@xsynaptic/mdxlint-config';
```

Override by spreading it:

```js
import base from '@xsynaptic/mdxlint-config';

export default {
	...base,
	settings: { ...base.settings, emphasis: '_' },
};
```

### CLI

The `mdxlint-content` bin globs `collections/**/*.mdx` under the target package, formats each file through mdxlint, applies textlint fixes when a local `.textlintrc.json` is present, and writes back only changed files.

```jsonc
// package.json
{
	"scripts": {
		"check-content": "mdxlint-content packages/content --root-path=$PWD",
		"fix-content": "mdxlint-content packages/content --fix --root-path=$PWD",
	},
}
```

Without `--fix` it reports and exits non-zero on warnings or formatting drift (a quality gate). With `--fix` it rewrites changed files. `--root-path` defaults to the current working directory.

textlint is intentionally left per-project: install its rules locally and add a `.textlintrc.json` next to `.mdxlintrc.mjs`.

## License

[MIT][mit-license]

[mdxlint]: https://github.com/remcohaszing/mdxlint
[textlint]: https://textlint.org
[vscode-mdxlint]: https://marketplace.visualstudio.com/items?itemName=remcohaszing.vscode-mdxlint
[mit-license]: https://opensource.org/licenses/MIT
