import type { PlaywrightTestConfig } from '@playwright/test';

import { defineConfig, devices } from '@playwright/test';

interface PlaygroundOptions {
	base?: string;
	playground: string;
	// Each package takes its own, so a server on Astro's default 4321 is never mistaken for its playground
	port: number;
	server: 'dev' | 'preview';
}

const servers = {
	// Reusing a running dev server is safe, since dev always serves the current source
	dev: {
		command: (filter: string, port: string) => `${filter} dev --port ${port}`,
		env: { ASTRO_DEV_BACKGROUND: '0' },
		reuseExistingServer: true,
		timeout: 60_000,
	},
	// Never reused, since that would skip the build and test a stale one
	preview: {
		command: (filter: string, port: string) =>
			`${filter} build && ${filter} preview --port ${port}`,
		env: { ASTRO_PREVIEW_BACKGROUND: '0' },
		reuseExistingServer: false,
		timeout: 120_000,
	},
} as const;

// Astro 7 daemonizes `astro dev` and `astro preview` when it detects an agent, so Playwright's webServer would exit early without the env above
export function definePlaygroundConfig(
	{ base = '/', playground, port, server }: PlaygroundOptions,
	...overrides: Array<PlaywrightTestConfig>
) {
	const baseURL = `http://localhost:${String(port)}${base}`;
	const { command, ...webServer } = servers[server];

	return defineConfig(
		{
			projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
			retries: 0,
			testDir: './tests',
			testMatch: '**/*.e2e.ts',
			use: { baseURL, trace: 'retain-on-failure' },
			webServer: {
				...webServer,
				command: command(`pnpm --filter @playground/${playground}`, String(port)),
				url: baseURL,
			},
		},
		...overrides,
	);
}
