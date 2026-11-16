import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['packages/*/verify/unit/**/*.test.ts'],
		testTimeout: 60_000,
	},
});
