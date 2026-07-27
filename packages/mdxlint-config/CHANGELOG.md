# @xsynaptic/mdxlint-config

## 1.0.1

### Patch Changes

- Drop the `[remarkLintListItemIndent, 'mixed']` override so list indentation is no longer self-contradictory. The rule stays active at `'one'` via `remark-preset-lint-recommended`, matching `settings.listItemIndent: 'one'`. Previously the override demanded tab-size indentation on loose list items while remark-stringify emitted one space, so any file with a loose list warned on every run and `--fix` wrote back the form the rule had just rejected, leaving consumers unable to reach zero warnings.

  `remark-lint-list-item-indent` is no longer a direct dependency; it comes in through the preset.

## 1.0.0

### Major Changes

- First stable release. No API changes: the public surface is now covered by semver, so patches and minor releases reach a `^1.0.0` range without a manual bump.

  The Sätteri plugins stay on `0.x` until Sätteri itself reaches 1.0.

## 0.2.0

### Minor Changes

- Add `@xsynaptic/mdxlint-config`: a shared mdxlint base config plus an `mdxlint-content` CLI that formats and lints MDX content with conditional writes (only changed files are rewritten). textlint support is per-project via a local `.textlintrc.json`.
