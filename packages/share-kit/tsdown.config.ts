import { defineConfig } from 'tsdown';

export default defineConfig({
	copy: ['src/styles.css'],
	dts: true,
	entry: ['src/index.ts'],
	format: 'esm',
	publint: true,
	sourcemap: true,
});
