import { defineConfig } from 'tsdown';

export default defineConfig({
	dts: true,
	entry: ['src/index.ts', 'src/cli.ts'],
	format: 'esm',
	publint: true,
	sourcemap: true,
});
