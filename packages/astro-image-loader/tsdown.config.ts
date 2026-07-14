import { defineConfig } from 'tsdown';

export default defineConfig({
	dts: true,
	entry: ['src/index.ts', 'src/exif.ts', 'src/dimensions.ts'],
	format: 'esm',
	sourcemap: true,
});
