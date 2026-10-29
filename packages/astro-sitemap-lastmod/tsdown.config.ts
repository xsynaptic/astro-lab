import { defineConfig } from 'tsdown';

export default defineConfig({
	dts: true,
	entry: {
		index: 'src/index.ts',
		write: 'src/write.ts',
	},
	format: 'esm',
	publint: true,
	sourcemap: true,
});
