import { defineConfig } from 'tsdown';

export default defineConfig({
	dts: true,
	entry: ['src/index.ts', 'src/astro.ts'],
	format: 'esm',
	sourcemap: true,
});
