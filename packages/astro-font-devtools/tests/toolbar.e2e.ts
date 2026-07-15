import { expect, test } from '@playwright/test';

import type { CatalogFont } from '../src/shared/types.js';

const appId = 'astro-font-devtools';

// Two providers so the global provider toggles render, proving the catalog parsed and drew.
const catalog: Array<CatalogFont> = [
	{
		category: 'sans-serif',
		family: 'Inter',
		italic: true,
		popularity: 1,
		providers: ['google', 'fontsource'],
		scripts: ['latin'],
		variable: true,
		weights: [400, 700],
	},
	{
		category: 'sans-serif',
		family: 'Roboto',
		italic: false,
		popularity: 2,
		providers: ['fontsource'],
		scripts: ['latin'],
		variable: false,
		weights: [400],
	},
];

test('opens the toolbar app and renders the mocked font catalog', async ({ page }) => {
	await page.route('**/__astro-font-devtools/catalog', (route) => route.fulfill({ json: catalog }));

	await page.goto('/');

	await page.locator(`button[data-app-id="${appId}"]`).click();

	await expect(page.locator('astro-dev-toolbar-button[data-provider="google"]')).toBeVisible();
	await expect(page.locator('astro-dev-toolbar-button[data-provider="fontsource"]')).toBeVisible();
	await expect(page.getByText('Loading fonts...')).toHaveCount(0);
});
