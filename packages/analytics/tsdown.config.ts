import { defineConfig } from 'tsdown';

export default defineConfig({
	dts: true,
	entry: {
		index: 'src/index.ts',
		umami: 'src/umami.ts',
		'umami-testing': 'src/umami-testing.ts',
	},
	format: 'esm',
	publint: true,
	sourcemap: true,
});
