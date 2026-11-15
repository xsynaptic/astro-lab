import { defineConfig, devices } from '@playwright/test';

// Dedicated, non-default port so the e2e server never reuses another Astro project on 4321
const port = 4331;
const baseURL = `http://localhost:${String(port)}`;

export default defineConfig({
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	retries: 0,
	testDir: './tests',
	testMatch: '**/*.e2e.ts',
	use: {
		baseURL,
		trace: 'on-first-retry',
	},
	webServer: {
		command: `pnpm --filter @playground/share-kit dev --port ${String(port)}`,
		// Astro 7 daemonizes `astro dev` when it detects an agent, which makes Playwright's webServer exit early; any value keeps it attached
		env: { ASTRO_DEV_BACKGROUND: '0' },
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
		url: baseURL,
	},
});
