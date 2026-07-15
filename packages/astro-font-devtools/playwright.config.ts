import { defineConfig, devices } from '@playwright/test';

// Dedicated, non-default port so the e2e server never reuses another Astro project on 4321.
const port = 4329;
const baseURL = `http://localhost:${String(port)}`;

export default defineConfig({
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	retries: process.env.CI ? 2 : 1,
	testDir: './tests',
	testMatch: '**/*.e2e.ts',
	use: {
		baseURL,
		trace: 'on-first-retry',
	},
	webServer: {
		command: `pnpm --filter @playground/astro-font-devtools dev --port ${String(port)}`,
		// Astro 7 daemonizes `astro dev` in agentic envs (am-i-vibing), which makes Playwright's
		// webServer exit early; keep it foreground so the server stays attached
		env: { ASTRO_DEV_BACKGROUND: '1' },
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
		url: baseURL,
	},
});
