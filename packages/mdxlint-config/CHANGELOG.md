# @xsynaptic/mdxlint-config

## 1.0.0

### Major Changes

- First stable release. No API changes: the public surface is now covered by semver, so patches and minor releases reach a `^1.0.0` range without a manual bump.

  The Sätteri plugins stay on `0.x` until Sätteri itself reaches 1.0.

## 0.2.0

### Minor Changes

- Add `@xsynaptic/mdxlint-config`: a shared mdxlint base config plus an `mdxlint-content` CLI that formats and lints MDX content with conditional writes (only changed files are rewritten). textlint support is per-project via a local `.textlintrc.json`.
