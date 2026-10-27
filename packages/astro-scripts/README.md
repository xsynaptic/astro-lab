# @xsynaptic/astro-scripts

Plumbing for an Astro project's `scripts` package: a command runner, output through interchangeable reporters, workspace root discovery, and a bridge for reading `astro:content` outside the Astro runtime. Early prototype; the API will move.

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

Output renders `pretty` on a TTY, `plain` elsewhere, and NDJSON with `--json`; `SCRIPTS_OUTPUT` overrides the choice. Run a `--json` command through `pnpm --silent`, or pnpm's own lines land in the stream.

Throw `UserError` for an expected failure: the run ends with its message and optional `detail`, and no stack. The runner matches it by `name === 'UserError'` and reads `detail` when it is a string, so a library can throw its own class of that name without depending on this package:

```ts
throw new UserError('Caddy did not reload', { detail: stderrTail });
```

`withAstroModules` and `withAstroContent` load `astro` and `vite` only when called, and need a content store written by `astro sync`.

## License

MIT
