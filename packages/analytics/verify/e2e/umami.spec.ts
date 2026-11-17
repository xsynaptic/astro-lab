import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

// Mirrors the tracker's history hook: a pageview for each pushState or replaceState call that carries a URL
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		const pageviews: Array<string> = [];

		for (const method of ['pushState', 'replaceState'] as const) {
			const original = history[method].bind(history);

			history[method] = (data, unused, url) => {
				original(data, unused, url);

				if (url) pageviews.push(new URL(url, location.href).pathname);
			};
		}

		Object.assign(globalThis, { pageviews });
	});
});

function getPageviews(page: Page) {
	return page.evaluate(() => (globalThis as { pageviews?: Array<string> }).pageviews ?? []);
}

test('records a pageview when the router goes back', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Second page' }).click();
	await expect.poll(() => getPageviews(page)).toEqual(['/second/']);

	await page.goBack();
	await expect.poll(() => getPageviews(page)).toEqual(['/second/', '/']);
});

test('updating attributes drops a key the new payload lacks', async ({ page }) => {
	await page.goto('/');

	const button = page.getByRole('button', { name: 'Mode' });

	await expect(button).toHaveAttribute('data-umami-event', 'mode-toggle');
	await expect(button).not.toHaveAttribute('data-umami-event-mode');
});
