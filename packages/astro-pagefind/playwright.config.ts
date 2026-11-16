import { devices } from '@playwright/test';

import { definePlaygroundConfig } from '../../playwright.base.ts';

// Dev serves no index until a build has written one
export default definePlaygroundConfig(
	{ base: '/lab/', playground: 'astro-pagefind', port: 4333, server: 'preview' },
	{
		projects: [
			{ name: 'chromium', use: devices['Desktop Chrome'] },
			{ grep: /@webkit/u, name: 'webkit', use: devices['Desktop Safari'] },
		],
	},
);
