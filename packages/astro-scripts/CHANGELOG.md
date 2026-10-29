# @xsynaptic/astro-scripts

## 0.13.0

### Minor Changes

- Breaking: `fetchUrl` (ky) replaces `fetchWithRetry`, and MDX component checks parse with Sätteri, a new optional peer. Commit dates handle non-ASCII paths, and an aborted subprocess that ignores SIGTERM is stopped after 5 s.

## 0.12.0

### Minor Changes

- Breaking: prefixed environment variables, `withAstroModules` unexported, Vite resolved from Astro instead of a peer; `findWorkspaceRoot` works without pnpm

## 0.11.0

### Minor Changes

- `--json` writes its events to stdout, with `log.data` as a `data` event, so `--json | jq` reads the stream without `2>&1`.

### Patch Changes

- `formatDuration` reads hours and minutes from an hour up (`9h 26m`, not `566m 17s`).

## 0.10.1

### Patch Changes

- Speed up `getEntryCommitDates` by giving `git log` one pathspec per repository; a progress that finishes inside its render interval reports the rate of the whole run.

## 0.10.0

### Minor Changes

- Share one Vite server per command; add `signal` to `fetchWithRetry`, which also retries network failures; add `capture` to `runChild` and `label` to `checkComponentTargets`; keep every repeated step warning and skip; speed up `getEntryCommitDates`.

## 0.9.0

### Minor Changes

- Add `readChild` to capture a child's output, and `env`, `input`, `onLine` (replacing `filter`) and `describe` on `runChild`; `withStep` takes `describe`, its `Step` gains `warn(detail)` and `skip(reason)`, and `end` lists warned and skipped steps; every status close carries `durationMs`; nested events carry `parent`; a leading `--` is dropped; `plain` progress prints at each tenth; `withStatus` is removed in favour of `withSpinner`.
- Add the shared content checks (`checkReferences`, `checkEntryIds`, `checkComponentProps`, `checkComponentTargets`) with their MDX helpers, `getEntryCommitDates`, `fetchWithRetry`, and a `severity` option on `toValidationResult`; each check locates an issue as `file:line`.

## 0.8.0

### Minor Changes

- Add `step.warn()` to `withStep`; a step's closing status carries `durationMs`, `runValidations` takes `(names, checks, { only })` and defaults to the command's signal, and durations under a second read in milliseconds.

## 0.7.0

### Minor Changes

- Add `withStep` and positional `choices`; `runChild` defaults to the command's signal, nested commands skip their title and footer, nested `log.data` arrives as a `data` event, a failed child names its command, and a zero-width terminal renders `plain`.

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
