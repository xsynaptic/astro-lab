import { unified } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import { remarkAutoImport } from '@xsynaptic/remark-auto-import';
import { defineConfig } from 'astro/config';

export default defineConfig({
	integrations: [mdx()],
	markdown: {
		processor: unified({
			remarkPlugins: [remarkAutoImport({ imports: ['./src/components/Quotation.astro'] })],
		}),
	},
});
