import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import { readingTime } from '@xsynaptic/satteri-reading-time';
import { defineConfig } from 'astro/config';

export default defineConfig({
	integrations: [mdx()],
	markdown: {
		processor: satteri({
			mdastPlugins: [readingTime()],
		}),
	},
});
