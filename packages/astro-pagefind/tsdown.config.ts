import { defineConfig } from 'tsdown';

export default defineConfig({
	copy: ['src/search-toggle.css'],
	dts: true,
	entry: {
		bundle: 'src/bundle.ts',
		index: 'src/index.ts',
		'search-toggle': 'src/search-toggle.ts',
	},
	format: 'esm',
	publint: true,
	sourcemap: true,
});
