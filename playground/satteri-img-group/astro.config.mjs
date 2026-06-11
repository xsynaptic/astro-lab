import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import { imgGroupSatteriPlugin } from '@xsynaptic/satteri-img-group';
import { defineConfig } from 'astro/config';

export default defineConfig({
	integrations: [mdx()],
	markdown: {
		processor: satteri({
			mdastPlugins: [imgGroupSatteriPlugin()],
		}),
	},
});
