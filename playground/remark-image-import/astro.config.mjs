import { unified } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import { remarkImageImport } from '@xsynaptic/remark-image-import';
import { defineConfig } from 'astro/config';

export default defineConfig({
	integrations: [mdx()],
	markdown: {
		processor: unified({
			remarkPlugins: [remarkImageImport()],
		}),
	},
});
