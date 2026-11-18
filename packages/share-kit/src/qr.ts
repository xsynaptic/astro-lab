import type { ShareCapability } from './actions.js';
import type { ShareKitStrings } from './strings.js';
import type { ShareKitPayload } from './types.js';

import { createElement, createIconSlot, polyfillLightDismiss } from './dom.js';

interface ShareQrInput {
	closeIcon: string | undefined;
	id: string;
	signal: AbortSignal;
	strings: Pick<ShareKitStrings<string>, 'close' | 'qrAlt' | 'qrTitle'>;
	url: string;
}

const qrSize = 200;

async function createQrSource(text: string) {
	const [{ generate }, { toSvgDataURL }] = await Promise.all([
		import('lean-qr'),
		import('lean-qr/extras/svg'),
	]);

	return toSvgDataURL(generate(text), { off: '#ffffff', on: '#000000', pad: 4, scale: 8 });
}

// Stacks over the share dialog rather than inside it, so opening the code moves nothing beneath
class ShareQrDialog {
	readonly dialog: HTMLDialogElement;
	#image: HTMLImageElement;
	#url: string;

	constructor({ closeIcon, id, signal, strings, url }: ShareQrInput) {
		const titleId = `${id}-title`;

		this.#url = url;
		this.#image = createElement('img', {
			alt: strings.qrAlt,
			class: 'share-kit-qr-image',
			height: String(qrSize),
			width: String(qrSize),
		});
		this.dialog = createElement(
			'dialog',
			{ 'aria-labelledby': titleId, class: 'share-kit-qr-dialog', closedby: 'any', id },
			[
				createElement('form', { class: 'share-kit-header', method: 'dialog' }, [
					createElement('h2', { class: 'share-kit-title', id: titleId }, [strings.qrTitle]),
					createElement(
						'button',
						{
							'aria-label': strings.close,
							class: 'share-kit-icon-button',
							title: strings.close,
							type: 'submit',
						},
						[createIconSlot('close', closeIcon, '×')],
					),
				]),
				this.#image,
			],
		);

		polyfillLightDismiss(this.dialog, signal);
	}

	async load() {
		if (!this.#image.getAttribute('src')) this.#image.src = await createQrSource(this.#url);
	}
}

interface ShareQrOptions extends Omit<ShareQrInput, 'url'> {
	capabilities: ReadonlySet<ShareCapability>;
	payload: ShareKitPayload<string>;
}

function getQrUrl(url: string, openHash: string | undefined) {
	if (!openHash || !URL.canParse(url)) return url;

	const target = new URL(url);

	target.hash = openHash;

	return target.href;
}

// A phone is already where the code would lead, so it gets none
export function createShareQr({ capabilities, payload, ...input }: ShareQrOptions) {
	if (capabilities.has('mobile')) return;

	return new ShareQrDialog({ ...input, url: getQrUrl(payload.url, payload.settings.openHash) });
}
