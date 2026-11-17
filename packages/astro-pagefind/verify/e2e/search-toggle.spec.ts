import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import type { SearchToggleSearchEndDetail } from '../../src/search-toggle.js';

import { searchToggleSearchEndEventName } from '../../src/search-toggle.js';

const paths = {
	home: 'toggle/',
	lighthouses: 'toggle/lighthouses/',
} as const;

// Only on the lighthouses page, which the inline layout indexes
const onePageQuery = 'wick';

// Only in the tide pools page's image URL, which Pagefind indexes as `image` meta
const imageOnlyQuery = 'periwinkle';

const pagefindChunk = /\/_astro\/component-ui\.[^/]+\.js$/u;

function getToggle(page: Page) {
	return page.locator('search-toggle button');
}

function getSearchInput(page: Page) {
	return page.locator('pagefind-input input');
}

function isPagefindDefined(page: Page) {
	return page.evaluate(() => customElements.get('pagefind-modal') !== undefined);
}

function getRegisteredCount(page: Page) {
	return page.evaluate(() => document.querySelector('search-toggle')?.instance?.components.length);
}

// The shortcut follows the page's user agent, not the machine running the test
async function getModifier(page: Page) {
	const isMac = await page.evaluate(() => /mac/iu.test(navigator.userAgent));

	return isMac ? 'Meta' : 'Control';
}

// The document outlives every ClientRouter swap, so the array keeps outcomes dispatched during one
async function recordSearches(page: Page) {
	await page.addInitScript((eventName) => {
		const searches: Array<unknown> = [];

		Object.assign(window, { searches });
		document.addEventListener(eventName, (event) => {
			searches.push((event as CustomEvent).detail);
		});
	}, searchToggleSearchEndEventName);
}

function getSearches(page: Page) {
	return page.evaluate(
		() => (window as { searches?: Array<SearchToggleSearchEndDetail> }).searches ?? [],
	);
}

// Resolves on the next astro:page-load, so a full page load fails it by destroying the context
async function navigateClientSide(page: Page, baseURL: string | undefined, path: string) {
	await page.evaluate(
		(href) =>
			new Promise<void>((resolve) => {
				document.addEventListener(
					'astro:page-load',
					() => {
						resolve();
					},
					{ once: true },
				);

				const link = document.createElement('a');

				link.href = href;
				document.body.append(link);
				link.click();
			}),
		new URL(path, baseURL).href,
	);
}

async function searchFor(page: Page, query: string) {
	const summary = page.locator('pagefind-summary');

	await getToggle(page).click();
	await expect(getSearchInput(page)).toBeFocused();
	await getSearchInput(page).pressSequentially(query, { delay: 30 });
	await expect(summary).toContainText(query, { timeout: 10_000 });
	await expect(summary).not.toContainText('Searching');
}

test('nothing from Pagefind loads until the toggle is reached for', async ({ page }) => {
	const chunkRequests: Array<string> = [];

	page.on('request', (request) => {
		if (pagefindChunk.test(request.url())) chunkRequests.push(request.url());
	});
	await page.goto(paths.home);

	const stylesheet = page.locator('link[data-pagefind-css]');

	await page.waitForLoadState('networkidle');
	await expect(getToggle(page)).toBeVisible();
	await expect(stylesheet).toHaveCount(0);
	expect(chunkRequests).toEqual([]);
	expect(await isPagefindDefined(page)).toBe(false);

	await getToggle(page).hover();

	await expect(stylesheet).toHaveCount(1);
	await expect.poll(() => isPagefindDefined(page)).toBe(true);
	expect(chunkRequests).toHaveLength(1);
});

test('a click from a cold start opens search, and Escape returns focus to the toggle', async ({
	page,
}) => {
	await page.goto(paths.home);

	const toggle = getToggle(page);

	await toggle.click();

	await expect(getSearchInput(page)).toBeFocused();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(toggle).toHaveAttribute('aria-controls', /.+/u);

	await page.keyboard.press('Escape');

	await expect(page.getByRole('dialog')).toBeHidden();
	await expect(toggle).toBeFocused();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('the shortcut opens search from a cold start, but not while typing', async ({ page }) => {
	await page.goto(paths.home);
	await page.evaluate(() => {
		const host = document.createElement('div');

		host.attachShadow({ mode: 'open' }).innerHTML = '<input aria-label="Shadow notes" />';
		document.querySelector('main')?.append(host);
	});

	const modifier = await getModifier(page);
	const shortcut = `${modifier}+k`;
	const stylesheet = page.locator('link[data-pagefind-css]');

	for (const name of ['Notes', 'Shadow notes']) {
		const input = page.getByRole('textbox', { exact: true, name });

		await input.focus();
		await page.keyboard.press(shortcut);

		// Opening appends the stylesheet in the same task as the keypress, so its absence is final
		await expect(stylesheet).toHaveCount(0);
		await expect(input).toBeFocused();
		await input.blur();
	}

	await page.keyboard.press(`${modifier}+Shift+k`);
	await page.keyboard.press('Alt+k');
	await expect(stylesheet).toHaveCount(0);

	await page.keyboard.press(shortcut);

	await expect(getSearchInput(page)).toBeFocused();
	await expect(getToggle(page)).toHaveAttribute('aria-expanded', 'true');
});

test('search still works after client-side navigation, with no leaked registrations', async ({
	baseURL,
	page,
}) => {
	await page.goto(paths.home);

	const toggle = getToggle(page);

	// Opening once loads Pagefind, so each later page's components register with it
	await toggle.click();
	await expect(getSearchInput(page)).toBeFocused();
	await page.keyboard.press('Escape');

	const registeredCount = await getRegisteredCount(page);

	for (const path of [paths.lighthouses, paths.home, paths.lighthouses]) {
		await navigateClientSide(page, baseURL, path);
	}

	await toggle.click();

	await expect(getSearchInput(page)).toBeFocused();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	expect(await getRegisteredCount(page)).toBe(registeredCount);

	// A stale trigger from an earlier page would take the focus on close
	await page.keyboard.press('Escape');

	await expect(toggle).toBeFocused();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('a result click reports the search as clicked', async ({ page }) => {
	await recordSearches(page);
	await page.goto(paths.home);
	await searchFor(page, onePageQuery);

	// Results link to the inline search pages, whose full load would discard the recorded outcomes
	await page.evaluate(() => {
		window.addEventListener(
			'click',
			(event) => {
				event.preventDefault();
			},
			{ capture: true },
		);
	});
	await page.locator('pagefind-results a[href]').first().click();

	await expect
		.poll(() => getSearches(page))
		.toEqual([{ clicked: true, query: onePageQuery, results: 1 }]);
});

test('a search closed with Escape reports as abandoned, with its zero count', async ({ page }) => {
	const query = 'qqqqqqqq';

	await recordSearches(page);
	await page.goto(paths.home);
	await searchFor(page, query);
	await page.keyboard.press('Escape');

	await expect.poll(() => getSearches(page)).toEqual([{ clicked: false, query, results: 0 }]);
});

test('a search left open across a history back reports once, as abandoned', async ({
	baseURL,
	page,
}) => {
	await recordSearches(page);
	await page.goto(paths.home);
	await navigateClientSide(page, baseURL, paths.lighthouses);
	await searchFor(page, onePageQuery);

	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				document.addEventListener(
					'astro:page-load',
					() => {
						resolve();
					},
					{ once: true },
				);
				history.back();
			}),
	);

	await expect(page).toHaveURL(new RegExp(`${paths.home}$`, 'u'));
	await expect
		.poll(() => getSearches(page))
		.toEqual([{ clicked: false, query: onePageQuery, results: 1 }]);
});

test('reopening and closing without a new search reports nothing more', async ({ page }) => {
	const toggle = getToggle(page);

	await recordSearches(page);
	await page.goto(paths.home);
	await searchFor(page, onePageQuery);
	await page.keyboard.press('Escape');
	// Pagefind's close handler, which ends the search, resets this; the dialog's own focus restore comes earlier
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');

	await toggle.click();
	await expect(getSearchInput(page)).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');

	expect(await getSearches(page)).toEqual([{ clicked: false, query: onePageQuery, results: 1 }]);
});

test('closing the modal clears the input', { tag: '@webkit' }, async ({ page }) => {
	const searchInput = getSearchInput(page);

	await page.goto(paths.home);
	await searchFor(page, onePageQuery);
	await page.keyboard.press('Escape');
	await expect(getToggle(page)).toBeFocused();

	await expect(searchInput).toHaveValue('');
});

test('a search landing after the modal closes is not reported', async ({ baseURL, page }) => {
	const summary = page.locator('pagefind-summary');

	await recordSearches(page);
	await page.goto(paths.home);
	// Without the reset, Pagefind still runs the debounced search for the last keypress after closing
	await page.locator('pagefind-modal').evaluate((element) => {
		element.setAttribute('reset-on-close', 'false');
	});
	await searchFor(page, onePageQuery);
	await getSearchInput(page).press('s');
	await page.keyboard.press('Escape');
	await expect(summary).toContainText(`${onePageQuery}s`, { timeout: 10_000 });
	await navigateClientSide(page, baseURL, paths.lighthouses);

	expect(await getSearches(page)).toEqual([{ clicked: false, query: onePageQuery, results: 1 }]);
});

test('a match only on an image URL is not counted as a result', async ({ page }) => {
	await recordSearches(page);
	await page.goto(paths.home);
	await searchFor(page, imageOnlyQuery);

	// Pagefind lists the page, so the zero below comes from the count rather than an empty index
	await expect(page.locator('pagefind-results a[href]')).not.toHaveCount(0);
	await page.keyboard.press('Escape');

	await expect
		.poll(() => getSearches(page))
		.toEqual([{ clicked: false, query: imageOnlyQuery, results: 0 }]);
});

test("Pagefind's screen reader announcer survives client-side navigation", async ({
	baseURL,
	page,
}) => {
	const announcer = page.locator('[data-pagefind-announcer]');

	await page.goto(paths.home);
	await getToggle(page).hover();
	await expect(announcer).toHaveCount(1);
	// Marks the node, so a fresh one created after the swap can't pass for it
	await announcer.evaluate((element) => {
		element.dataset.original = '';
	});

	await navigateClientSide(page, baseURL, paths.lighthouses);
	await searchFor(page, onePageQuery);

	await expect(announcer).toHaveCount(1);
	await expect(announcer).toHaveAttribute('data-original', '');
});

test("the package's layered rules hold the modal's layout over Pagefind's sheet", async ({
	page,
}) => {
	await page.goto(paths.home);
	await getToggle(page).click();
	await expect(getSearchInput(page)).toBeFocused();

	const display = await page
		.locator('pagefind-modal')
		.evaluate((element) => getComputedStyle(element).display);

	expect(display).toBe('contents');
});
