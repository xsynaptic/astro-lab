import type { BrowserContext, Page } from '@playwright/test';

import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Firefox lets a page read what it wrote and knows neither name; WebKit knows only the read one
const clipboardPermissions = {
	chromium: ['clipboard-read', 'clipboard-write'],
	firefox: [],
	webkit: ['clipboard-read'],
} as const;

async function grantClipboard(
	context: BrowserContext,
	browserName: keyof typeof clipboardPermissions,
) {
	await context.grantPermissions([...clipboardPermissions[browserName]]);
}

async function openSpecimen(page: Page, id: string) {
	await page.goto('/');

	const trigger = page.locator(`#${id} [data-share-kit-trigger]`).first();

	await expect(trigger).toBeEnabled();
	await trigger.click();

	const dialog = page.locator(`#${id} .share-kit-dialog`);

	await expect(dialog).toBeVisible();

	return dialog;
}

test('the trigger opens the dialog, focuses its heading and reports the action', async ({
	page,
}) => {
	const dialog = await openSpecimen(page, 'desktop');

	await expect(dialog.getByRole('heading', { level: 2, name: 'Share this page' })).toBeFocused();
	await expect(page.locator('[data-event-log]')).toContainText('"action":"open"');
});

test('the open hash opens the first dialog that claims it, and closing clears the hash', async ({
	page,
}) => {
	await page.goto('/#share');

	const dialog = page.locator('#desktop .share-kit-dialog');

	await expect(dialog).toBeVisible();
	await expect(page.locator('#single-destination .share-kit-dialog')).toHaveCount(0);
	await expect(page.locator('[data-event-log]')).toContainText('"action":"open"');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(page).toHaveURL((url) => url.hash === '');
});

test('Escape and a backdrop click close the dialog', async ({ page }) => {
	const dialog = await openSpecimen(page, 'desktop');

	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();

	await page.locator('#desktop [data-share-kit-trigger]').click();
	await expect(dialog).toBeVisible();
	await page.mouse.click(5, 5);
	await expect(dialog).toBeHidden();
});

test('arrow keys move between destinations', async ({ page }) => {
	const dialog = await openSpecimen(page, 'desktop');
	const anywhere = dialog.getByRole('radio', { name: 'Anywhere' });
	const bluesky = dialog.getByRole('radio', { name: 'Bluesky' });

	await expect(anywhere).toHaveAttribute('aria-checked', 'true');
	await anywhere.focus();
	await page.keyboard.press('ArrowRight');

	await expect(bluesky).toBeFocused();
	await expect(bluesky).toHaveAttribute('aria-checked', 'true');
	await expect(anywhere).toHaveAttribute('aria-checked', 'false');
});

test('destination buttons show the icons the host passed', async ({ page }) => {
	const dialog = await openSpecimen(page, 'desktop');

	await expect(dialog.getByRole('radio', { name: 'Bluesky' }).locator('svg')).toBeVisible();
});

test('the link comes last, after the images', async ({ page }) => {
	const dialog = await openSpecimen(page, 'desktop');

	await expect(dialog.locator('.share-kit-heading')).toHaveText([
		'Post to',
		'Text',
		'Images',
		'Link',
	]);
});

test('a named trigger opens the same dialog with its destination selected', async ({ page }) => {
	const dialog = await openSpecimen(page, 'named-triggers');

	await expect(dialog.getByRole('radio', { name: 'Anywhere' })).toHaveAttribute(
		'aria-checked',
		'true',
	);
	await page.keyboard.press('Escape');
	await page.locator('#named-triggers').getByRole('button', { name: 'Share on Reddit' }).click();

	await expect(dialog).toBeVisible();
	await expect(page.locator('#named-triggers .share-kit-dialog')).toHaveCount(1);
	await expect(dialog.getByRole('radio', { name: 'Reddit' })).toHaveAttribute(
		'aria-checked',
		'true',
	);
	await expect(page.locator('[data-event-log]')).toHaveText(
		'{"action":"open","destination":"reddit"}',
	);
});

test('a single destination drops the Post to row but keeps its hint', async ({ page }) => {
	const dialog = await openSpecimen(page, 'single-destination');

	await expect(dialog.getByRole('radiogroup')).toHaveCount(0);
	await expect(dialog.locator('.share-kit-heading').first()).toHaveText('Text');
	await expect(dialog.locator('.share-kit-hint').first()).toContainText(
		'Facebook only takes the link',
	);
	await expect(dialog.locator('.share-kit-primary')).toHaveText('Open Facebook');
});

test('a desktop gets no Share button on its images', async ({ page }) => {
	const dialog = await openSpecimen(page, 'desktop');

	await expect(dialog.locator('[data-share-kit-action="share"]')).toHaveCount(0);
	await expect(dialog.locator('[data-share-kit-action="copy"]').first()).toBeVisible();
});

async function stubShareSheet(page: Page) {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: () =>
				new Promise((resolve, reject) => {
					addEventListener(
						'share-stub',
						(event) => {
							const name = event instanceof CustomEvent ? String(event.detail) : '';

							if (name) reject(new DOMException('Stubbed', name));
							else resolve(undefined);
						},
						{ once: true },
					);
				}),
		});
	});
}

async function settleShareSheet(page: Page, errorName = '') {
	await page.evaluate(
		(name) => dispatchEvent(new CustomEvent('share-stub', { detail: name })),
		errorName,
	);
}

test('the share sheet reports its outcome once it settles', async ({ page }) => {
	await stubShareSheet(page);

	const dialog = await openSpecimen(page, 'phone');
	const eventLog = page.locator('[data-event-log]');
	const primary = dialog.locator('.share-kit-primary');

	await expect(primary).toHaveText('Share');
	await primary.click();
	await expect(eventLog).toContainText('"action":"open"');

	await settleShareSheet(page);
	await expect(eventLog).toHaveText(
		'{"action":"share-text","destination":"any","outcome":"shared"}',
	);

	await primary.click();
	await settleShareSheet(page, 'AbortError');
	await expect(eventLog).toContainText('"outcome":"dismissed"');

	await primary.click();
	await settleShareSheet(page, 'DataError');
	await expect(eventLog).toContainText('"outcome":"error"');
	await expect(dialog.locator('.share-kit-status')).toHaveText(
		'Something went wrong. Try saving instead.',
	);
});

test('a caption over the limit is counted and announced', async ({ page }) => {
	const dialog = await openSpecimen(page, 'over-limit');

	await expect(dialog.locator('.share-kit-count')).toHaveAttribute('data-share-kit-over');
	await expect(dialog.locator('.share-kit-count')).toContainText('185 over');
	await expect(dialog.locator('.share-kit-visually-hidden')).toHaveText(
		'185 over the limit for Threads',
	);
	await expect(dialog.locator('.share-kit-status')).toBeEmpty();
});

// Firefox spends the click's activation on the new tab, so only a write started before it lands
test(
	"the composer button opens the destination's composer, with the caption on the clipboard",
	{
		tag: '@firefox',
	},
	async ({ browserName, context, page }) => {
		await grantClipboard(context, browserName);
		await context.route('https://bsky.app/**', (route) => route.fulfill({ body: 'composer' }));

		const dialog = await openSpecimen(page, 'desktop');

		await dialog.getByRole('radio', { name: 'Bluesky' }).click();

		const primary = dialog.locator('.share-kit-primary');

		await expect(primary).toHaveText('Open Bluesky');

		const [popup] = await Promise.all([page.waitForEvent('popup'), primary.click()]);
		const composer = new URL(popup.url());

		expect(composer.origin + composer.pathname).toBe('https://bsky.app/intent/compose');
		expect(composer.searchParams.get('text')).toContain("The Lighthouse Keeper's Cat");
		expect(composer.searchParams.get('text')).toContain('utm_source=bluesky');
		await expect(page.locator('[data-event-log]')).toContainText('"action":"open-composer"');
		await expect(dialog.locator('.share-kit-status')).toHaveText('Copied');

		const caption = await dialog.getByRole('textbox', { name: 'Text' }).inputValue();

		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(caption);
	},
);

test('LINE opens its web share page on a desktop', async ({ context, page }) => {
	await context.route('https://social-plugins.line.me/**', (route) =>
		route.fulfill({ body: 'composer' }),
	);

	const dialog = await openSpecimen(page, 'desktop');

	await dialog.getByRole('radio', { name: 'LINE' }).click();

	const primary = dialog.locator('.share-kit-primary');

	await expect(primary).toHaveText('Open LINE');

	const [popup] = await Promise.all([page.waitForEvent('popup'), primary.click()]);
	const composer = new URL(popup.url());

	expect(composer.origin + composer.pathname).toBe('https://social-plugins.line.me/lineit/share');
	expect(composer.searchParams.get('url')).toContain('utm_source=line');
	expect(composer.searchParams.get('text')).toContain("The Lighthouse Keeper's Cat");
	await expect(page.locator('[data-event-log]')).toContainText('"destination":"line"');
});

test('Mastodon opens its hosted composer with the text in the fragment', async ({
	context,
	page,
}) => {
	await context.route('https://share.joinmastodon.org/**', (route) =>
		route.fulfill({ body: 'composer' }),
	);

	const dialog = await openSpecimen(page, 'desktop');

	await dialog.getByRole('radio', { name: 'Mastodon' }).click();

	const caption = await dialog.getByRole('textbox', { name: 'Text' }).inputValue();
	const [popup] = await Promise.all([
		page.waitForEvent('popup'),
		dialog.getByRole('button', { name: 'Open Mastodon' }).click(),
	]);
	const composer = new URL(popup.url());

	expect(composer.origin + composer.pathname).toBe('https://share.joinmastodon.org/');
	expect(composer.search).toBe('');
	expect(new URLSearchParams(composer.hash.slice(1)).get('text')).toBe(caption);
});

test("LINE opens its app's share screen on a phone", async ({ context, page }) => {
	await context.route('https://line.me/**', (route) => route.fulfill({ body: 'composer' }));

	const dialog = await openSpecimen(page, 'phone');

	await dialog.getByRole('radio', { name: 'LINE' }).click();

	const [popup] = await Promise.all([
		page.waitForEvent('popup'),
		dialog.locator('.share-kit-primary').click(),
	]);
	const composer = new URL(popup.url());

	expect(composer.origin + composer.pathname).toBe('https://line.me/R/share');
	expect(composer.searchParams.get('text')).toContain("The Lighthouse Keeper's Cat");
});

// Chromium only; WebKit and Firefox hand `mailto:` to the OS, which opens the system mail client
test('a mailto: composer hands off without opening a tab', async ({ context, page }) => {
	const dialog = await openSpecimen(page, 'desktop');
	const pageUrl = page.url();
	const errors: Array<string> = [];
	let popups = 0;

	context.on('page', () => {
		popups += 1;
	});
	page.on('pageerror', (error) => {
		errors.push(error.message);
	});
	await dialog.getByRole('radio', { name: 'Email' }).click();
	await dialog.locator('.share-kit-primary').click();

	await expect(page.locator('[data-event-log]')).toContainText('"action":"open-composer"');
	await expect(page.locator('[data-event-log]')).toContainText('"destination":"email"');
	expect(popups).toBe(0);
	await expect(dialog).toBeVisible();
	expect(page.url()).toBe(pageUrl);
	expect(errors).toEqual([]);
});

test('icons from a slow loader patch into the open dialog without moving it', async ({ page }) => {
	const { promise: released, resolve: release } = Promise.withResolvers<undefined>();

	// The dialog's rise animation would move it between the two measurements
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.route('**/src/lib/icons.ts*', async (route) => {
		await released;
		await route.continue();
	});

	const dialog = await openSpecimen(page, 'desktop');
	const bluesky = dialog.getByRole('radio', { name: 'Bluesky' });

	await expect(bluesky.locator('.share-kit-icon')).toBeAttached();
	await expect(bluesky.locator('svg')).toHaveCount(0);

	const before = await Promise.all([dialog.boundingBox(), bluesky.boundingBox()]);

	release(undefined);
	await expect(bluesky.locator('svg')).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Close' }).locator('svg')).toBeVisible();

	expect(await Promise.all([dialog.boundingBox(), bluesky.boundingBox()])).toEqual(before);
});

test('copying the caption puts it on the clipboard', async ({ browserName, context, page }) => {
	await grantClipboard(context, browserName);

	const dialog = await openSpecimen(page, 'desktop');
	const primary = dialog.locator('.share-kit-primary');

	await expect(primary).toHaveText('Copy text');
	await primary.click();
	await expect(dialog.locator('.share-kit-status')).toHaveText('Copied');

	const caption = await dialog.getByRole('textbox', { name: 'Text' }).inputValue();
	const clipboard = await page.evaluate(() => navigator.clipboard.readText());

	expect(clipboard).toBe(caption);
	expect(clipboard).toContain('https://example.com/lighthouse-keepers-cat/');
});

test('Story drops the text field and copies its tagged link', async ({
	browserName,
	context,
	page,
}) => {
	await grantClipboard(context, browserName);

	const dialog = await openSpecimen(page, 'desktop');

	await dialog.getByRole('radio', { name: 'Story' }).click();
	await expect(dialog.getByRole('textbox')).toBeHidden();
	await dialog.getByRole('button', { name: 'Copy link' }).click();

	const clipboard = await page.evaluate(() => navigator.clipboard.readText());

	expect(new URL(clipboard).searchParams.get('utm_source')).toBe('instagram-story');
	await expect(dialog.locator('.share-kit-link')).toHaveText(clipboard);
	await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible();
	await expect(dialog.locator('.share-kit-status')).toHaveAttribute('data-share-kit-hidden');
});

test('Instagram on a desktop saves the suggested image and copies the text', async ({
	browserName,
	context,
	page,
}) => {
	await grantClipboard(context, browserName);

	const dialog = await openSpecimen(page, 'desktop');

	await dialog.getByRole('radio', { name: 'Instagram' }).click();

	const caption = await dialog.getByRole('textbox', { name: 'Text' }).inputValue();
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		dialog.getByRole('button', { name: 'Save image' }).click(),
	]);

	expect(download.suggestedFilename()).toBe('lighthouse-cat-portrait.jpg');
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(caption);
	await expect(page.locator('[data-event-log]')).toContainText(
		'{"action":"save","destination":"instagram","asset":"portrait","outcome":"saved"}',
	);
});

test(
	'copying an image puts a PNG of it on the clipboard',
	{
		tag: ['@firefox', '@webkit'],
	},
	async ({ browserName, context, page }) => {
		await grantClipboard(context, browserName);

		// No `data-can`, so the copy button is there only if this engine's clipboard takes PNG
		const dialog = await openSpecimen(page, 'this-device');
		const tile = dialog.locator('[data-share-kit-asset="landscape"]');
		const preview = await tile.getByRole('img').evaluate((image) => ({
			height: Number(image.getAttribute('height')),
			width: Number(image.getAttribute('width')),
		}));

		await tile.getByRole('button', { exact: true, name: 'Copy' }).click();
		await expect(dialog.locator('.share-kit-status')).toHaveText('Copied');

		const copied = await page.evaluate(async () => {
			const [item] = await navigator.clipboard.read();

			if (!item) return;

			const bitmap = await createImageBitmap(await item.getType('image/png'));

			return { height: bitmap.height, types: item.types, width: bitmap.width };
		});

		expect(copied).toEqual({ ...preview, types: ['image/png'] });
	},
);

test(
	'saving an image downloads the file itself',
	{
		tag: ['@firefox', '@webkit'],
	},
	async ({ page }) => {
		const dialog = await openSpecimen(page, 'this-device');
		const tile = dialog.locator('[data-share-kit-asset="landscape"]');
		const source = await tile.getByRole('img').getAttribute('src');
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			tile.getByRole('button', { exact: true, name: 'Save' }).click(),
		]);

		expect(download.suggestedFilename()).toBe('lighthouse-cat-landscape.jpg');
		expect(source).not.toBeNull();
		await expect(page.locator('[data-event-log]')).toContainText('"action":"save"');
		await expect(page.locator('[data-event-log]')).toContainText('"outcome":"saved"');

		const served = await page.request.get(source ?? '');

		expect(await readFile(await download.path())).toEqual(await served.body());
	},
);

test(
	'the QR code dialog opens over the share dialog, and Escape closes it alone',
	{
		tag: ['@firefox', '@webkit'],
	},
	async ({ page }) => {
		const dialog = await openSpecimen(page, 'desktop');

		await dialog.getByRole('button', { name: 'Open on phone' }).click();

		const qrDialog = page.locator('#desktop .share-kit-qr-dialog');
		const qrImage = qrDialog.getByRole('img', { name: 'QR code for this page' });

		await expect(qrDialog).toBeVisible();
		await expect(qrImage).toHaveAttribute('src', /^data:image\/svg\+xml/u);
		await expect
			.poll(() => qrImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
			.toBeGreaterThan(0);

		await page.keyboard.press('Escape');
		await expect(qrDialog).toBeHidden();
		await expect(dialog).toBeVisible();
	},
);

test("an edited caption keeps the reader's words and swaps in the new destination's link", async ({
	page,
}) => {
	const dialog = await openSpecimen(page, 'desktop');
	const caption = dialog.getByRole('textbox', { name: 'Text' });

	await dialog.getByRole('radio', { name: 'Bluesky' }).click();
	await caption.evaluate((element: HTMLTextAreaElement) => {
		element.focus();
		element.setSelectionRange(0, 0);
	});
	await page.keyboard.type('Edited. ');
	await dialog.getByRole('radio', { name: 'Threads' }).click();

	await expect(caption).toHaveValue(/^Edited\. /u);
	await expect(caption).toHaveValue(/utm_source=threads/u);
	await expect(caption).not.toHaveValue(/utm_source=bluesky/u);
});

// The 2:3 pin card is the nearest to Bluesky's 4:5 once the portrait card is gone
test('a missing image hides its tile, and the nearest card is suggested instead', async ({
	page,
}) => {
	const dialog = await openSpecimen(page, 'failed-preview');

	await dialog.getByRole('radio', { name: 'Bluesky' }).click();

	await expect(dialog.locator('[data-share-kit-asset="portrait"]')).toBeHidden();
	await expect(dialog.locator('[data-share-kit-asset="pin"] .share-kit-badge')).toBeVisible();
});

test('a phone gets no QR code and hands image posts to the share sheet', async ({ page }) => {
	const dialog = await openSpecimen(page, 'phone');
	const primary = dialog.locator('.share-kit-primary');

	await expect(dialog.getByRole('button', { name: 'Open on phone' })).toHaveCount(0);
	await expect(primary).toHaveText('Share');
	await dialog.getByRole('radio', { name: 'Bluesky' }).click();
	await expect(primary).toHaveText('Share image');
});

test('an element moved in the page starts over with a fresh caption', async ({ page }) => {
	const dialog = await openSpecimen(page, 'desktop');

	await dialog.getByRole('textbox', { name: 'Text' }).fill('Edited');
	await page.keyboard.press('Escape');
	await page.locator('#desktop share-kit').evaluate((element) => {
		element.parentElement?.append(element);
	});
	await page.locator('#desktop [data-share-kit-trigger]').click();

	await expect(dialog.getByRole('textbox', { name: 'Text' })).toHaveValue(
		/^The Lighthouse Keeper's Cat/u,
	);
});

// Stands in for Safari 26.2: without the property the polyfill runs; without the attribute the engine can't close the dialog itself
async function withoutNativeLightDismiss(page: Page, { isPolyfilled }: { isPolyfilled: boolean }) {
	await page.addInitScript((shouldPolyfill) => {
		if (shouldPolyfill) Reflect.deleteProperty(HTMLDialogElement.prototype, 'closedBy');

		Element.prototype.setAttribute = new Proxy(Element.prototype.setAttribute, {
			apply(setAttribute, element: Element, [name, value]: [string, string]) {
				if (name === 'closedby' && element instanceof HTMLDialogElement) return;

				Reflect.apply(setAttribute, element, [name, value]);
			},
		});
	}, isPolyfilled);
}

async function dragBetween(
	page: Page,
	from: { x: number; y: number },
	to: { x: number; y: number },
) {
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(to.x, to.y);
	await page.mouse.up();
}

test.describe('the light dismiss polyfill', { tag: '@webkit' }, () => {
	const backdrop = { x: 5, y: 5 };

	test('a backdrop click leaves the dialog open without it, so the polyfill is what closes it', async ({
		page,
	}) => {
		await withoutNativeLightDismiss(page, { isPolyfilled: false });

		const dialog = await openSpecimen(page, 'desktop');

		await page.mouse.click(backdrop.x, backdrop.y);
		await expect(dialog).toBeVisible();
	});

	test('a backdrop click closes the dialog, but a drag across its edge does not', async ({
		page,
	}) => {
		await withoutNativeLightDismiss(page, { isPolyfilled: true });

		const dialog = await openSpecimen(page, 'desktop');
		const box = await dialog.boundingBox();
		const inside = { x: (box?.x ?? 0) + 40, y: (box?.y ?? 0) + 40 };

		await dragBetween(page, inside, backdrop);
		await expect(dialog).toBeVisible();
		await dragBetween(page, backdrop, inside);
		await expect(dialog).toBeVisible();

		await page.mouse.click(backdrop.x, backdrop.y);
		await expect(dialog).toBeHidden();
	});

	test('a backdrop click closes the QR code dialog alone', async ({ page }) => {
		await withoutNativeLightDismiss(page, { isPolyfilled: true });

		const dialog = await openSpecimen(page, 'desktop');
		const qrDialog = page.locator('#desktop .share-kit-qr-dialog');

		await dialog.getByRole('button', { name: 'Open on phone' }).click();
		await expect(qrDialog).toBeVisible();

		await page.mouse.click(backdrop.x, backdrop.y);
		await expect(qrDialog).toBeHidden();
		await expect(dialog).toBeVisible();

		await page.mouse.click(backdrop.x, backdrop.y);
		await expect(dialog).toBeHidden();
	});
});
