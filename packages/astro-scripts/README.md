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

Output renders `pretty` on a TTY, `plain` elsewhere, and NDJSON with `--json`: events on stderr, each `log.data` value bare on stdout. Run a `--json` command through `pnpm --silent -C <scripts package>` so pnpm's own lines stay out of the stream.

`withAstroModules` and `withAstroContent` need a content store written by `astro sync`.

`runChild` runs a child process as a step, and `withStep` runs in-process work as one; its task can call `step.warn()` to close with a warning. The child writes straight to stderr, except under `--json` or a `filter`, where each line becomes an `output` event; a nested command's `log.data` arrives as a `data` event.

## License

MIT
