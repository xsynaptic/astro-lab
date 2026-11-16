import { defineConfig } from 'tsdown';

export default defineConfig({
	dts: true,
	entry: {
		'path-suggestions': 'src/path-suggestions/index.ts',
		'progress-loading': 'src/progress-loading/index.ts',
		'progress-reading': 'src/progress-reading/index.ts',
		'top-button': 'src/top-button/index.ts',
	},
	format: 'esm',
	publint: true,
	sourcemap: true,
});
