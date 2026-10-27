import { defineConfig } from 'tsdown';

export default defineConfig({
	dts: true,
	entry: {
		index: 'src/astro-integration.ts',
		node: 'src/node.ts',
		presets: 'src/presets.ts',
	},
	format: 'esm',
	sourcemap: true,
});
