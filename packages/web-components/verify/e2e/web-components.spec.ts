import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

interface SwapSample {
	hasOpacityTransition: boolean;
	isActive: boolean;
	opacity: string;
	progress: string;
	time: number;
}

const startProgress = '0.2';

function getProgress(page: Page, selector: string) {
	return page.locator(selector).evaluate((element) => {
		if (!(element instanceof HTMLElement)) return '';

		return element.style.getPropertyValue('--progress');
	});
}

async function holdFetch(page: Page, path: string) {
	const { promise: released, resolve } = Promise.withResolvers<true>();

	await page.route(
		(url) => url.pathname === path,
		async (route) => {
			if (route.request().isNavigationRequest()) return route.continue();

			await released;
			await route.continue();
		},
	);

	return () => {
		resolve(true);
	};
}

async function reveal(page: Page) {
	await scrollBy(page, 5000);
	await expect(page.locator('top-button')).toHaveAttribute('inert');
	await scrollBy(page, -100);
	await expect(page.locator('top-button')).not.toHaveAttribute('inert');
}

async function scrollArticle(page: Page, fraction: number) {
	await page.evaluate((target) => {
		const article = document.querySelector('[data-reading-frame]');

		if (!article) return;

		const rect = article.getBoundingClientRect();
		const scrollable = rect.height - window.innerHeight;

		window.scrollTo(0, rect.top + window.scrollY + scrollable * target);
	}, fraction);
}

async function scrollBy(page: Page, pixels: number) {
	await page.evaluate(async (delta) => {
		window.scrollBy(0, delta);
		await new Promise((resolve) => {
			requestAnimationFrame(resolve);
		});
		await new Promise((resolve) => {
			requestAnimationFrame(resolve);
		});
	}, pixels);
}

async function recordSwap(page: Page) {
	await page.evaluate((resetProgress) => {
		const samples: Array<SwapSample> = [];

		Object.assign(globalThis, { swapSamples: samples });
		document.addEventListener(
			'astro:after-swap',
			() => {
				const bar = document.querySelector('progress-loading');

				if (!bar) return;

				const start = performance.now();

				function sample() {
					if (!bar) return;

					const progress = bar.style.getPropertyValue('--progress');
					const opacity = getComputedStyle(bar).opacity;

					samples.push({
						hasOpacityTransition: bar
							.getAnimations()
							.some(
								(animation) =>
									animation instanceof CSSTransition && animation.transitionProperty === 'opacity',
							),
						isActive: Object.hasOwn(bar.dataset, 'active'),
						opacity,
						progress,
						time: performance.now() - start,
					});

					const isReset =
						progress === resetProgress && samples.some((previous) => previous.opacity === '0');

					if (isReset || performance.now() - start > 5000) {
						Object.assign(globalThis, { isSwapRecorded: true });
						return;
					}

					requestAnimationFrame(sample);
				}

				requestAnimationFrame(sample);
			},
			{ once: true },
		);
	}, startProgress);
}

async function getSwapSamples(page: Page) {
	await expect
		.poll(() => page.evaluate(() => (globalThis as { isSwapRecorded?: boolean }).isSwapRecorded), {
			timeout: 10_000,
		})
		.toBe(true);

	return page.evaluate(
		() => (globalThis as unknown as { swapSamples: Array<SwapSample> }).swapSamples,
	);
}

test.describe('<progress-loading>', () => {
	for (const variant of ['moveBefore', 'without moveBefore'] as const) {
		test(`climbs while loading, holds through the swap, fades, then resets (${variant})`, async ({
			page,
		}) => {
			if (variant === 'without moveBefore') {
				await page.addInitScript(() => {
					Reflect.deleteProperty(Element.prototype, 'moveBefore');
				});
			}

			await page.goto('/second/');
			expect(await page.evaluate(() => 'moveBefore' in Element.prototype)).toBe(
				variant === 'moveBefore',
			);

			const release = await holdFetch(page, '/');
			const bar = page.locator('progress-loading');

			await recordSwap(page);
			await page.getByRole('link', { name: 'Article' }).click();
			await expect(bar).toHaveAttribute('data-active');
			await expect
				.poll(async () => Number(await getProgress(page, 'progress-loading')))
				.toBeGreaterThan(0.2);

			release();

			const samples = await getSwapSamples(page);
			const [first] = samples;
			const faded = samples.findIndex((sample) => sample.opacity === '0');
			const reset = samples.findIndex((sample) => sample.progress === startProgress);

			expect(first).toMatchObject({
				hasOpacityTransition: true,
				isActive: false,
				opacity: '1',
				progress: '1',
			});
			expect(faded).toBeGreaterThan(0);
			expect(reset).toBeGreaterThanOrEqual(faded);
			expect(samples.slice(0, faded).every((sample) => sample.progress === '1')).toBe(true);
		});
	}

	test('a second navigation mid-load leaves no trickle running', async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('load');
		// Installed after load, since the dev toolbar calls `performance.addEventListener`, which the fake lacks
		await page.clock.install();

		const releaseSecond = await holdFetch(page, '/second/');
		const releaseArticle = await holdFetch(page, '/');
		const bar = page.locator('progress-loading');

		await page.getByRole('link', { name: 'Second page' }).click();
		await expect(bar).toHaveAttribute('data-active');
		await page.getByRole('link', { name: 'Article' }).click();
		await page.clock.runFor(500);
		releaseArticle();
		releaseSecond();
		await expect(page.locator('main h1')).toHaveText("The lighthouse keeper's log");
		await expect(bar).not.toHaveAttribute('data-active');
		await expect.poll(() => getProgress(page, 'progress-loading')).toBe(startProgress);
		await page.clock.runFor(1000);

		expect(await getProgress(page, 'progress-loading')).toBe(startProgress);
		await expect(bar).not.toHaveAttribute('data-active');
	});

	test('a navigation the router abandons for a same-page link leaves the bar idle', async ({
		page,
	}) => {
		await page.goto('/');

		const release = await holdFetch(page, '/second/');
		const bar = page.locator('progress-loading');

		await page.getByRole('link', { name: 'Second page' }).click();
		await expect(bar).toHaveAttribute('data-active');
		await page.getByRole('link', { name: 'Skip to content' }).click();

		await expect(bar).not.toHaveAttribute('data-active');
		await expect.poll(() => getProgress(page, 'progress-loading')).toBe(startProgress);
		release();
	});

	test('a navigation handed to the browser leaves an idle bar in the back-forward cache', async ({
		page,
	}) => {
		await page.addInitScript(() => {
			addEventListener('pageshow', (event) => {
				if (!event.persisted) return;

				const bar = document.querySelector('progress-loading');

				Object.assign(globalThis, { restoredOpacity: bar ? getComputedStyle(bar).opacity : '' });
			});
		});
		await page.goto('/');
		await page.waitForLoadState('load');

		const release = await holdFetch(page, '/second/');

		await page.evaluate(() => {
			document.addEventListener(
				'astro:before-preparation',
				(event) => {
					const { loader } = event as Event & { loader: () => Promise<void> };

					Object.assign(event, {
						loader: async () => {
							await loader();
							event.preventDefault();
						},
					});
				},
				{ once: true },
			);
		});

		const loaded = page.waitForEvent('load');

		await page.getByRole('link', { name: 'Second page' }).click();
		await expect(page.locator('progress-loading')).toHaveAttribute('data-active');
		release();
		await loaded;
		await expect(page).toHaveURL('/second/');
		await page.goBack({ waitUntil: 'commit' });

		await expect
			.poll(() => page.evaluate(() => (globalThis as { restoredOpacity?: string }).restoredOpacity))
			.toBe('0');
	});
});

test.describe('<progress-reading>', () => {
	test('tracks the article, clears at the end and returns on the way back', async ({ page }) => {
		await page.goto('/');

		const bar = page.locator('progress-reading');

		await scrollArticle(page, 0.25);
		await expect
			.poll(async () => Number(await getProgress(page, 'progress-reading')))
			.toBeCloseTo(0.25, 1);
		await expect(bar).toHaveAttribute('data-active');

		await scrollArticle(page, 0.6);
		await expect
			.poll(async () => Number(await getProgress(page, 'progress-reading')))
			.toBeCloseTo(0.6, 1);

		await scrollArticle(page, 1.1);
		await expect.poll(() => getProgress(page, 'progress-reading')).toBe('1');
		await expect(bar).not.toHaveAttribute('data-active');

		await scrollArticle(page, 0.5);
		await expect(bar).toHaveAttribute('data-active');
	});

	test('scroll-padding-top counts as a covered band', async ({ page }) => {
		await page.goto('/');
		await scrollArticle(page, 0.1);
		await expect
			.poll(async () => Number(await getProgress(page, 'progress-reading')))
			.toBeCloseTo(0.1, 2);

		const uncovered = Number(await getProgress(page, 'progress-reading'));

		await page.evaluate(() => {
			document.documentElement.style.scrollPaddingTop = '200px';
			dispatchEvent(new Event('resize'));
		});

		await expect
			.poll(async () => Number(await getProgress(page, 'progress-reading')))
			.toBeGreaterThan(uncovered + 0.01);
	});
});

test.describe('<top-button>', () => {
	test.use({ reducedMotion: 'reduce', viewport: { height: 800, width: 400 } });

	test('a cancelled top-button:activate neither scrolls nor focuses; the next scrolls to the top and focuses its target', async ({
		page,
	}) => {
		await page.goto('/');
		await page.evaluate(() => {
			document.addEventListener(
				'top-button:activate',
				(event) => {
					Object.assign(globalThis, { focusTargetId: event.detail.focusTarget?.id });
					event.preventDefault();
				},
				{ once: true },
			);
		});
		await reveal(page);

		const button = page.getByRole('button', { name: 'Back to top' });
		const scrollY = await page.evaluate(() => window.scrollY);

		await button.click();

		expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
		expect(
			await page.evaluate(() => (globalThis as { focusTargetId?: string }).focusTargetId),
		).toBe('main-content');
		await expect(page.locator('#main-content')).not.toBeFocused();

		await button.click();

		await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
		await expect(page.locator('#main-content')).toBeFocused();
		await expect(page.locator('#main-content')).toHaveAttribute('tabindex', '-1');
	});

	test('a host at display: none stops reacting to scroll', async ({ page }) => {
		await page.goto('/');
		await reveal(page);
		await page.setViewportSize({ height: 800, width: 1024 });

		const button = page.locator('top-button');

		await expect(button).toHaveCSS('display', 'none');
		await expect(button).toHaveAttribute('inert');
		await scrollBy(page, 400);
		await scrollBy(page, -200);
		await expect(button).toHaveAttribute('inert');

		await page.setViewportSize({ height: 800, width: 400 });
		await scrollBy(page, 400);
		await scrollBy(page, -200);
		await expect(button).not.toHaveAttribute('inert');
	});
});

test.describe('<path-suggestions>', () => {
	test('a near-miss path lists suggestions', async ({ page }) => {
		await page.goto('/tide');

		const element = page.locator('path-suggestions');

		await expect(element).toHaveAttribute('data-state', 'list');
		await expect(element.getByRole('link').first()).toHaveText('Tide pools');
		await expect(element.getByRole('link').first()).toHaveAttribute(
			'data-astro-history',
			'replace',
		);
	});

	test('a close match fires a redirect event, and cancelling it keeps the page', async ({
		page,
	}) => {
		await page.addInitScript(() => {
			document.addEventListener('path-suggestions:redirect', (event) => {
				Object.assign(globalThis, { redirectUrl: event.detail.url });
				event.preventDefault();
			});
		});
		await page.goto('/secon');

		await expect(page.locator('path-suggestions')).toHaveAttribute('data-state', 'redirect');
		expect(await page.evaluate(() => (globalThis as { redirectUrl?: string }).redirectUrl)).toBe(
			'/second/',
		);
		await expect(page).toHaveURL('/secon');
	});

	test('navigating away while the manifest is loading never reloads the 404', async ({ page }) => {
		const documents: Array<string> = [];

		page.on('request', (request) => {
			if (request.isNavigationRequest()) documents.push(new URL(request.url()).pathname);
		});

		const release = await holdFetch(page, '/content-manifest.json');
		const manifest = page.waitForResponse(
			(response) => new URL(response.url()).pathname === '/content-manifest.json',
		);

		await page.goto('/secon');
		await expect(page.locator('path-suggestions')).toHaveAttribute('data-state', 'loading');
		await page.getByRole('link', { name: 'Article' }).click();
		await expect(page.locator('main h1')).toHaveText("The lighthouse keeper's log");
		release();

		const response = await manifest;

		await response.finished();
		await page.evaluate(
			() =>
				new Promise((resolve) => {
					setTimeout(resolve, 0);
				}),
		);

		await expect(page).toHaveURL('/');
		expect(documents).toEqual(['/secon']);
	});
});
