import { defineConfig } from 'tsdown';

export default defineConfig({
	dts: true,
	entry: ['src/integration.ts', 'src/toolbar.ts'],
	format: 'esm',
	minify: false,
	sourcemap: true,
});
