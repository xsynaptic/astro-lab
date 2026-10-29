# @xsynaptic/astro-scripts

Plumbing for an Astro project's `scripts` package: a command runner, output through interchangeable reporters, content validation, and a bridge for reading `astro:content` outside the Astro runtime. Early prototype; the API will move.

```sh
pnpm add @xsynaptic/astro-scripts
```

```ts
import {
	createCommandRunner,
	getCollectionEntries,
	log,
	withAstroContent,
} from '@xsynaptic/astro-scripts';

const { runCommand } = createCommandRunner();

await runCommand({
	name: 'count-posts',
	run: async () => {
		const posts = await withAstroContent((content) => getCollectionEntries(content, ['posts']));

		log.data(posts.length);
	},
	summary: 'Count published posts',
	title: 'Posts',
});
```

Output renders `pretty` on a TTY, `plain` elsewhere, and NDJSON events on stdout with `--json`, each `log.data` value as a `data` event. Run a `--json` command through `pnpm --silent -C <scripts package>` so pnpm's own lines stay out of the stream.

`withAstroContent` needs a content store written by `astro sync`, and the project's `cacheDir` set to `'./.astro/'`: `astro sync` writes the store to `cacheDir`, while the bridge runs Astro in dev mode, which reads it from `.astro/`.

`runChild` runs a child process as a step, and `withStep` runs in-process work as one; `describe(result)` sets a step's closing text, and its task can call `step.warn(detail)` or `step.skip(reason)`, which the run lists before its footer. The child writes straight to stderr, except under `--json` or with `onLine`, where each line becomes an `output` event; `onLine` returning `false` hides a line. Each nested event carries `parent: { command, id }`, the step it ran under. `readChild` runs a child with no step and returns its `stdout`, `stderr` and `exitCode`. Both pass the whole parent environment to the child, with `env` merged over it; set a key to `undefined` to keep it from the child (`env: { NODE_ENV: undefined }`).

Statuses pair on `command` plus `id`, since a nested command's ids restart at 1. A leading `--`, as pnpm forwards it, is dropped before parsing.

`checkReferences`, `checkEntryIds`, `checkComponentProps` and `checkComponentTargets` are the checks every content project runs, each returning a `ValidationResult` for `runValidations`; `findComponentTags`, `getTagProp` and `getBodyLineOffset` are their MDX helpers, for a project's own checks. `getEntryCommitDates` dates entries by their last commit, and `fetchWithRetry` retries a request once after a timeout or a network failure.

## License

MIT
