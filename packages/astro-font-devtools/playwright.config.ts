import { definePlaygroundConfig } from '../../playwright.base.ts';

export default definePlaygroundConfig(
	{ playground: 'astro-font-devtools', port: 4329, server: 'dev' },
	{ retries: 1 },
);
