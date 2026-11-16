import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

async function openSpecimen(page: Page, id: string) {
	await page.goto('/');

	const trigger = page.locator(`#${id} [data-share-kit-trigger]`);

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

test('the open hash opens its dialog, and closing clears the hash', async ({ page }) => {
	await page.goto('/#share');

	const dialog = page.locator('#desktop .share-kit-dialog');

	await expect(dialog).toBeVisible();
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

test('a caption over the limit is counted and announced', async ({ page }) => {
	const dialog = await openSpecimen(page, 'over-limit');

	await expect(dialog.locator('.share-kit-count')).toHaveAttribute('data-share-kit-over');
	await expect(dialog.getByRole('status')).toContainText('over the limit for Threads');
});

test("the composer button opens the destination's composer with the caption", async ({
	context,
	page,
}) => {
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
});

test('copying the caption puts it on the clipboard', async ({ context, page }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	const dialog = await openSpecimen(page, 'desktop');
	const primary = dialog.locator('.share-kit-primary');

	await expect(primary).toHaveText('Copy caption');
	await primary.click();
	await expect(dialog.getByRole('status')).toHaveText('Copied');

	const caption = await dialog.getByRole('textbox', { name: 'Caption' }).inputValue();
	const clipboard = await page.evaluate(() => navigator.clipboard.readText());

	expect(clipboard).toBe(caption);
	expect(clipboard).toContain('https://example.com/lighthouse-keepers-cat/');
});

test('the QR code dialog opens over the share dialog', async ({ page }) => {
	const dialog = await openSpecimen(page, 'desktop');

	await dialog.getByRole('button', { name: 'Continue on your phone' }).click();

	const qrDialog = page.locator('#desktop .share-kit-qr-dialog');

	await expect(qrDialog).toBeVisible();
	await expect(qrDialog.getByRole('img', { name: 'QR code for this page' })).toHaveAttribute(
		'src',
		/^data:image\/svg\+xml/u,
	);
});

test("an edited caption keeps the reader's words and swaps in the new destination's link", async ({
	page,
}) => {
	const dialog = await openSpecimen(page, 'desktop');
	const caption = dialog.getByRole('textbox', { name: 'Caption' });

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

test('More reveals the remaining destinations, and arrow keys reach them', async ({ page }) => {
	const dialog = await openSpecimen(page, 'desktop');
	const mastodon = dialog.getByRole('radio', { name: 'Mastodon' });

	await expect(mastodon).toBeHidden();
	await dialog.getByRole('button', { name: 'More' }).click();
	await expect(mastodon).toBeFocused();

	await dialog.getByRole('radio', { name: 'Threads' }).focus();
	await page.keyboard.press('ArrowRight');
	await expect(mastodon).toBeFocused();
	await expect(mastodon).toHaveAttribute('aria-checked', 'true');
});

test('a missing image hides its tile, and the next image is suggested instead', async ({
	page,
}) => {
	const dialog = await openSpecimen(page, 'failed-preview');

	await dialog.getByRole('radio', { name: 'Bluesky' }).click();

	await expect(dialog.locator('[data-share-kit-asset="portrait"]')).toBeHidden();
	await expect(dialog.locator('[data-share-kit-asset="landscape"] .share-kit-badge')).toBeVisible();
});

test('a phone gets no QR code and hands image posts to the share sheet', async ({ page }) => {
	const dialog = await openSpecimen(page, 'phone');
	const primary = dialog.locator('.share-kit-primary');

	await expect(dialog.getByRole('button', { name: 'Continue on your phone' })).toHaveCount(0);
	await expect(primary).toHaveText('Share');
	await dialog.getByRole('radio', { name: 'Bluesky' }).click();
	await expect(primary).toHaveText('Share image');
});

test('an element moved in the page starts over with a fresh caption', async ({ page }) => {
	const dialog = await openSpecimen(page, 'desktop');

	await dialog.getByRole('textbox', { name: 'Caption' }).fill('Edited');
	await page.keyboard.press('Escape');
	await page.locator('#desktop share-kit').evaluate((element) => {
		element.parentElement?.append(element);
	});
	await page.locator('#desktop [data-share-kit-trigger]').click();

	await expect(dialog.getByRole('textbox', { name: 'Caption' })).toHaveValue(
		/^The Lighthouse Keeper's Cat/u,
	);
});
