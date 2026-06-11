import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import { autoImport } from '@xsynaptic/satteri-auto-import';
import { defineConfig } from 'astro/config';

export default defineConfig({
	integrations: [mdx()],
	markdown: {
		processor: satteri({
			mdastPlugins: [autoImport({ imports: ['./src/components/Quotation.astro'] })],
		}),
	},
});
