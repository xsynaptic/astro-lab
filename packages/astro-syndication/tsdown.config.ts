import { defineConfig } from 'tsdown';

export default defineConfig({
	dts: true,
	entry: {
		html: 'src/html.ts',
		index: 'src/index.ts',
		render: 'src/render.ts',
		rss: 'src/rss.ts',
	},
	format: 'esm',
	publint: true,
	sourcemap: true,
});
