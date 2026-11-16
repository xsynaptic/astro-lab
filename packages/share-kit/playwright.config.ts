import { devices } from '@playwright/test';

import { definePlaygroundConfig } from '../../playwright.base.ts';

export default definePlaygroundConfig(
	{ playground: 'share-kit', port: 4331, server: 'dev' },
	{
		projects: [
			{ name: 'chromium', use: devices['Desktop Chrome'] },
			{ grep: /@firefox/u, name: 'firefox', use: devices['Desktop Firefox'] },
			{ grep: /@webkit/u, name: 'webkit', use: devices['Desktop Safari'] },
		],
	},
);
