import { defineConfig } from 'tsdown';

export default defineConfig({
	dts: true,
	entry: ['src/index.ts', 'src/element.ts'],
	format: 'esm',
	publint: true,
	sourcemap: true,
});
