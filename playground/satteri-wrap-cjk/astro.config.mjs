import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import { wrapCjk } from '@xsynaptic/satteri-wrap-cjk';
import { defineConfig } from 'astro/config';

export default defineConfig({
	integrations: [mdx()],
	markdown: {
		processor: satteri({
			hastPlugins: [wrapCjk({ value: 'cjk' })],
		}),
	},
});
