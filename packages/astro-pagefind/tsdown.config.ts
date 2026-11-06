import { defineConfig } from 'tsdown';

export default defineConfig({
	dts: true,
	entry: {
		bundle: 'src/bundle.ts',
		index: 'src/index.ts',
	},
	format: 'esm',
	publint: true,
	sourcemap: true,
});
