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

Output renders `pretty` on a TTY, `plain` elsewhere, and NDJSON with `--json`; `SCRIPTS_OUTPUT` overrides the choice. Run a `--json` command through `pnpm -s`, or pnpm's own banner lines land in the stream.

`withAstroModules` and `withAstroContent` load `astro` and `vite` only when called, and need a content store written by `astro sync`.

## License

MIT
