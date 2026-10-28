import { defineConfig } from 'tsdown';

export default defineConfig({
	dts: true,
	entry: {
		index: 'src/astro-integration.ts',
		names: 'src/names.ts',
		node: 'src/node.ts',
	},
	format: 'esm',
	sourcemap: true,
});
