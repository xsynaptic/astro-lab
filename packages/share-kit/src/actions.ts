import type { ShareKitActionOutcome } from './types.js';

const shareCapabilities = ['files', 'link', 'copy-image', 'mobile'] as const;

export type ShareCapability = (typeof shareCapabilities)[number];

export interface ShareAssetSource {
	filename: string;
	src: string;
	type: string;
}

const pngType = 'image/png';

function canShareFiles() {
	if (!('canShare' in navigator)) return false;

	return navigator.canShare({ files: [new File([], 'probe.jpg', { type: 'image/jpeg' })] });
}

function canCopyImage() {
	if (!('clipboard' in navigator) || !('ClipboardItem' in globalThis)) return false;

	return 'supports' in ClipboardItem && ClipboardItem.supports(pngType);
}

const capabilityTests = {
	'copy-image': canCopyImage,
	files: canShareFiles,
	// A phone's share sheet reaches its apps; a desktop's mostly reaches Mail and AirDrop
	link: () => 'share' in navigator,
	mobile: () => matchMedia('(pointer: coarse)').matches,
} as const satisfies Record<ShareCapability, () => boolean>;

function isShareCapability(value: string): value is ShareCapability {
	return shareCapabilities.some((capability) => capability === value);
}

// A list already on the element wins, so a page can show how the dialog looks on another device
export function getShareCapabilities(preset: string | undefined) {
	if (preset !== undefined) {
		const tokens = preset.split(/\s+/u).filter(Boolean);
		const unknown = tokens.filter((token) => !isShareCapability(token));

		if (unknown.length > 0) {
			console.warn(`share-kit: unknown data-can tokens ignored: ${unknown.join(', ')}`);
		}

		return tokens.filter(isShareCapability);
	}

	return shareCapabilities.filter((capability) => capabilityTests[capability]());
}

export function isDomError(error: unknown, name: string) {
	return error instanceof DOMException && error.name === name;
}

export async function shareData(data: ShareData): Promise<ShareKitActionOutcome> {
	try {
		await navigator.share(data);

		return 'shared';
	} catch (error) {
		return isDomError(error, 'AbortError') ? 'dismissed' : 'error';
	}
}

// `no-cache` revalidates a copy cached without CORS headers, which this fetch would reject
export async function fetchFile({ filename, src, type }: ShareAssetSource, signal: AbortSignal) {
	const response = await fetch(src, { cache: 'no-cache', signal });

	if (!response.ok) throw new Error(`${String(response.status)} for ${src}`);

	return new File([await response.blob()], filename, { type });
}

// `download` is ignored on a cross-origin href, so the file goes through an object URL
export function saveFile(file: File) {
	const objectUrl = URL.createObjectURL(file);
	const link = document.createElement('a');

	link.download = file.name;
	link.href = objectUrl;
	link.hidden = true;
	document.body.append(link);
	link.click();
	link.remove();

	return objectUrl;
}

// PNG is the only image type every browser's async clipboard accepts
async function toPngBlob(pending: Promise<File | undefined>) {
	const file = await pending;

	if (!file) throw new Error('The image did not load');

	const bitmap = await createImageBitmap(file);
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const context = canvas.getContext('2d');

	if (!context) throw new Error('No 2D context for the PNG conversion');

	context.drawImage(bitmap, 0, 0);
	bitmap.close();

	return canvas.convertToBlob({ type: pngType });
}

export function copyImage(file: Promise<File | undefined>) {
	return navigator.clipboard.write([new ClipboardItem({ [pngType]: toPngBlob(file) })]);
}

export function isOpenHash(openHash: string | undefined) {
	return openHash !== undefined && location.hash === `#${openHash}`;
}

// Replacing the entry keeps the router's state and stops a reload or Back from reopening the dialog
export function clearOpenHash(openHash: string | undefined) {
	if (!isOpenHash(openHash)) return;

	history.replaceState(history.state, '', `${location.pathname}${location.search}`);
}

// A `mailto:` href opened in a new tab would leave it blank
export function openComposer(href: string) {
	const { protocol } = new URL(href, location.href);

	if (protocol !== 'http:' && protocol !== 'https:') {
		location.assign(href);
		return;
	}

	window.open(href, '_blank', 'noopener');
}
