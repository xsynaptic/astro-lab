import { defineConfig, devices } from '@playwright/test';

const port = 4332;
const baseURL = `http://localhost:${String(port)}`;

export default defineConfig({
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				channel: 'chromium',
				launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] },
			},
		},
	],
	retries: 0,
	testDir: './tests',
	testMatch: '**/*.e2e.ts',
	use: {
		baseURL,
		trace: 'on-first-retry',
	},
	webServer: {
		command: `pnpm --filter @playground/web-components dev --port ${String(port)}`,
		env: { ASTRO_DEV_BACKGROUND: '0' },
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
		url: baseURL,
	},
});
