# @xsynaptic/astro-scripts

Plumbing for an Astro project's `scripts` package: a command runner, output through interchangeable reporters, workspace root discovery, and a bridge for reading `astro:content` outside the Astro runtime. Early prototype; the API will move.

```sh
pnpm add @xsynaptic/astro-scripts
```

```ts
import { createCommandRunner, log } from '@xsynaptic/astro-scripts';
import { getCollectionEntries, withAstroContent } from '@xsynaptic/astro-scripts/astro';

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

Output renders `pretty` on a TTY, `plain` elsewhere, and NDJSON with `--json`; `SCRIPTS_OUTPUT` overrides the choice. The `/astro` entry needs `astro` and `vite` installed and a content store written by `astro sync`.

## License

MIT
