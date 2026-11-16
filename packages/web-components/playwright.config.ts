import { definePlaygroundConfig } from '../../playwright.base.ts';

export default definePlaygroundConfig(
	{ playground: 'web-components', port: 4332, server: 'dev' },
	{
		projects: [
			{
				name: 'chromium',
				use: {
					channel: 'chromium',
					launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] },
				},
			},
		],
	},
);
