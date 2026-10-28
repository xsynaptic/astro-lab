# @xsynaptic/astro-scripts

## 0.6.0

### Minor Changes

- Add `runChild`, which runs a child process as a step and keeps its output off stdout; under `--json` its lines arrive as `output` events. It replaces `$({ stdio: 'inherit' })` for build, check and test steps, and a hand-piped filter such as resonance's `runWrangler`. A child step's status `start` event carries its `argv`.

## 0.5.0

### Minor Changes

- `createProgress` requires its `total` again and `setTotal` is gone: its only callers now learn the total before the run starts. A JSON `progress` event always carries `total`.

## 0.4.1

### Patch Changes

- A positional marked `required: true` types as present, so `const [id] = positionals` reads a `string` and a `[id = '']` default can go.

## 0.4.0

### Minor Changes

- Add content validation: `runValidations` runs a project's checks and reports each result as command output, structured under `--json`.

## 0.3.1

### Patch Changes

- `createProgress` takes its `total` later through `setTotal`, counting without one until then (a JSON `progress` event omits `total` until it is known). A positional marked `required: true` reads `<name>` in the usage line, and a run without it fails with "See --help".

## 0.3.0

### Minor Changes

- `log`, `Status` and `Progress` members can be passed as values under `@typescript-eslint/unbound-method`; export the `Status` and `Progress` types.

## 0.2.1

### Patch Changes

- `UserError` detail, and fixes from spectralcodex.

## 0.2.0

### Minor Changes

- Single entry point, `UserError`, report output, and fixes from integrating into spectralcodex.

## 0.1.0

### Minor Changes

- First release: a project-bound command runner, output through `pretty`, `plain` and `json` reporters, progress and status helpers, `findWorkspaceRoot`, and a `/astro` bridge (`withAstroModules`, `withAstroContent`, `getCollectionEntries`) for reading `astro:content` from scripts.
