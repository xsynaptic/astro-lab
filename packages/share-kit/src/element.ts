import type { ShareCapability } from './actions.js';
import type { ShareOutcome } from './assets.js';
import type { ShareKitDestinationId, SharePrimaryAction } from './destinations.js';
import type { ShareKitIcons } from './icons.js';
import type { ShareKitParts } from './render.js';
import type { ShareKitStrings } from './strings.js';
import type { ShareKitAction, ShareKitActionDetail, ShareKitPayload } from './types.js';

import { clearOpenHash, getShareCapabilities, isDomError, isOpenHash } from './actions.js';
import { ShareAssetFiles } from './assets.js';
import { fitCaption } from './caption.js';
import {
	getDestinationUrl,
	getPrimaryAction,
	getShareDestination,
	isShareDestinationId,
	shareDestinationAny,
} from './destinations.js';
import { polyfillLightDismiss, radioKeys } from './dom.js';
import { ShareFeedback } from './feedback.js';
import { getDestinationLists, getShareStrings, readSharePayload } from './payload.js';
import { createShareQr } from './qr.js';
import { renderShareKit } from './render.js';
import { shareKitStringDefaults } from './strings.js';
import { getSuggestedAsset, syncCaptionView, syncDestinationView } from './sync.js';
import { shareKitActionEventName } from './types.js';

const outcomeMessages = {
	error: 'error',
	retry: 'retry',
	saved: 'saved',
	unsaved: 'saveError',
} as const satisfies Partial<Record<ShareOutcome, keyof ShareKitStrings>>;

let dialogCount = 0;

function isKeyOf<Key extends string>(record: Record<Key, unknown>, key: string): key is Key {
	return Object.hasOwn(record, key);
}

// Server rendering has no `HTMLElement`; the stand-in lets the module load there and is never constructed
const BaseElement =
	typeof HTMLElement === 'undefined' ? (Object as unknown as typeof HTMLElement) : HTMLElement;

export class ShareKitElement extends BaseElement {
	protected readonly icons: ShareKitIcons = {};

	#abortController: AbortController | undefined;
	#actions = {
		close: () => {
			this.#parts?.dialog.close();
		},
		copy: (button: HTMLElement, tile?: HTMLElement) => {
			if (!tile) return;

			this.#track('copy', tile);
			void this.#feedback?.copyImage(this.#files?.load(tile) ?? Promise.resolve(undefined), button);
		},
		'copy-caption': (button: HTMLElement) => {
			this.#track('copy-caption');
			void this.#copyCaption(button);
		},
		'copy-link': (button: HTMLElement) => {
			this.#track('copy-link');
			void this.#feedback?.copyText(this.#payload?.url ?? '', button);
		},
		destination: (button: HTMLElement) => {
			const id = button.dataset.shareKitDestination;

			if (!id || !isShareDestinationId(id)) return;

			this.#selectDestination(id);
			this.#track('destination');
		},
		more: (button: HTMLElement) => {
			this.#showMore(button);
		},
		primary: () => {
			this.#primaryActions[this.#getPrimaryAction()]();
		},
		qr: () => {
			void this.#openQr();
		},
		reset: () => {
			this.#isCaptionEdited = false;
			this.#syncDestination();
		},
		save: (_button: HTMLElement, tile?: HTMLElement) => {
			if (tile) void this.#saveAsset(tile);
		},
		share: (_button: HTMLElement, tile?: HTMLElement) => {
			if (tile) void this.#shareAssets([tile]);
		},
	};
	#capabilities = new Set<ShareCapability>();
	#destination: ShareKitDestinationId = shareDestinationAny;
	#feedback: ShareFeedback | undefined;
	#files: ShareAssetFiles | undefined;
	#isCaptionEdited = false;
	#isOver = false;
	#parts: ShareKitParts | undefined;
	#payload: ShareKitPayload | undefined;
	#primaryActions = {
		'copy-caption': () => {
			this.#track('copy-caption');
			void this.#copyCaption();
		},
		// The composer can't always take the text, so it rides along on the clipboard
		'open-composer': () => {
			const url = this.#getComposerUrl();

			if (!url) return;

			this.#track('open-composer');
			void this.#copyCaption();
			window.open(url, '_blank', 'noopener');
		},
		// Both start inside the tap, before any await, or the browser refuses one of them
		'share-image': () => {
			const tile = this.#getSuggestedAsset();

			if (!tile) return;

			void this.#copyCaption();
			void this.#shareAssets([tile]);
		},
		// The platform's app drops shared text too, so the caption rides on the clipboard as with an image
		'share-link': () => {
			void this.#copyCaption();
			void this.#shareData('share-link', { url: this.#getUrl() });
		},
		'share-text': () => {
			const text = this.#parts?.caption.value;

			if (text) void this.#shareData('share-text', { text });
		},
	} satisfies Record<SharePrimaryAction, () => void>;
	#qr: ReturnType<typeof createShareQr>;
	#strings: ShareKitStrings = shareKitStringDefaults;

	connectedCallback() {
		if (this.#abortController) return;

		const payload = readSharePayload(this);

		if (!payload) {
			this.#retryWhenParsed();
			return;
		}

		this.#abortController = new AbortController();
		this.#payload = payload;
		this.#strings = getShareStrings(payload.strings);
		this.#feedback = new ShareFeedback(() => this.#parts?.status, this.#strings);

		const { signal } = this.#abortController;

		this.#capabilities = new Set(getShareCapabilities(this.dataset.can));
		this.#files = new ShareAssetFiles({
			canShare: this.#capabilities.has('files'),
			getSource: (tile) => this.#parts?.assets.get(tile),
			signal,
		});

		this.addEventListener('click', this.#handleClick, { signal });
		this.addEventListener('input', this.#handleInput, { signal });
		this.addEventListener('keydown', this.#handleKeydown, { signal });
		this.addEventListener('error', this.#handlePreviewError, { capture: true, signal });
		this.addEventListener('pointerover', ({ target }) => this.#files?.warm(target), { signal });
		window.addEventListener('hashchange', this.#handleHashChange, { signal });
		// The trigger ships disabled so a tap before this runs isn't silently lost
		this.querySelector('[data-share-kit-trigger]')?.toggleAttribute('disabled', false);

		// Deferred so a listener added after `defineShareKit()` in the same task still hears `open`
		queueMicrotask(() => {
			if (!signal.aborted && isOpenHash(payload.settings.openHash)) this.#open();
		});
	}

	disconnectedCallback() {
		this.#parts?.dialog.remove();
		this.#parts = undefined;
		this.#qr = undefined;
		this.#abortController?.abort();
		this.#abortController = undefined;
		this.#feedback?.dispose();
		this.#feedback = undefined;
		this.#files?.dispose();
		this.#files = undefined;
		this.#destination = shareDestinationAny;
		this.#isCaptionEdited = false;
		this.#isOver = false;
	}

	// A failed write selects the caption, so it is ready to copy by hand once the reader is back
	async #copyCaption(button?: HTMLElement) {
		const caption = this.#parts?.caption;

		if (caption) await this.#feedback?.copyText(caption.value, button, caption);
	}

	#getAssets() {
		return (this.#parts?.tiles ?? []).filter((tile) => tile.dataset.shareKitState !== 'failed');
	}

	#getComposerUrl() {
		const parts = this.#parts;

		if (!parts) return;

		const suggested = this.#getSuggestedAsset();
		const media = suggested ? parts.assets.get(suggested)?.src : undefined;

		return getShareDestination(this.#destination).getComposerUrl?.({
			media: media ? new URL(media, location.href).href : undefined,
			text: parts.caption.value,
			url: this.#getUrl(),
		});
	}

	#getPrimaryAction() {
		return getPrimaryAction({
			canShareFiles: this.#capabilities.has('files') && this.#getSuggestedAsset() !== undefined,
			canShareText: this.#capabilities.has('link'),
			hasComposerUrl: this.#getComposerUrl() !== undefined,
			id: this.#destination,
			isHandheld: this.#capabilities.has('handheld'),
		});
	}

	#getSuggestedAsset() {
		return getSuggestedAsset(this.#getAssets(), this.#destination);
	}

	#getUrl() {
		const payload = this.#payload;

		if (!payload) return '';

		return getDestinationUrl(payload.url, this.#destination, payload.settings.utmMedium);
	}

	#handleClick = (event: MouseEvent) => {
		if (!(event.target instanceof Element)) return;

		if (event.target.closest('[data-share-kit-trigger]')) {
			this.#open();
			return;
		}

		const button = event.target.closest<HTMLElement>('[data-share-kit-action]');
		const action = button?.dataset.shareKitAction;

		if (!button || !action || !isKeyOf(this.#actions, action)) return;

		this.#actions[action](
			button,
			button.closest<HTMLElement>('[data-share-kit-asset]') ?? undefined,
		);
	};

	#handleClose = () => {
		clearOpenHash(this.#payload?.settings.openHash);
	};

	#handleHashChange = () => {
		if (isOpenHash(this.#payload?.settings.openHash)) this.#open();
	};

	#handleInput = (event: Event) => {
		if (event.target === this.#parts?.caption) this.#isCaptionEdited = true;

		this.#syncCaption();
	};

	#handleKeydown = (event: KeyboardEvent) => {
		const move = radioKeys[event.key];

		if (!move || !(event.target instanceof HTMLElement) || event.target.role !== 'radio') return;

		const radios = [...this.querySelectorAll<HTMLElement>('[role="radio"]:not([hidden])')];
		const next = radios[move(radios.indexOf(event.target), radios.length)];
		const id = next?.dataset.shareKitDestination;

		if (!next || !id || !isShareDestinationId(id)) return;

		event.preventDefault();
		this.#selectDestination(id);
		next.focus();
	};

	#handlePreviewError = (event: Event) => {
		if (!(event.target instanceof HTMLImageElement)) return;

		const tile = event.target.closest<HTMLElement>('[data-share-kit-asset]');

		if (!tile) return;

		tile.dataset.shareKitState = 'failed';
		this.#syncDestination();
	};

	#open() {
		const parts = this.#parts ?? this.#render();

		if (!parts || parts.dialog.open) return;

		parts.dialog.showModal();
		// Focusing the heading lets a screen reader start from the dialog's name
		parts.heading.focus();
		this.#track('open');
		// Synced again once open, since a status written to a closed dialog goes unannounced
		this.#isOver = false;
		this.#syncCaption();
	}

	async #openQr() {
		this.#track('qr');

		try {
			await this.#qr?.open();
		} catch {
			this.#feedback?.announce(this.#strings.error);
		}
	}

	// The primary button shares the suggested image on a phone, so only that file is fetched ahead
	#prefetch() {
		if (!this.#capabilities.has('files') || !this.#capabilities.has('handheld')) return;

		const tile = this.#getSuggestedAsset();

		if (tile) void this.#files?.load(tile);
	}

	#render() {
		const payload = this.#payload;
		const signal = this.#abortController?.signal;

		if (!payload || !signal) return;

		const { main, more } = getDestinationLists(payload.settings);

		dialogCount += 1;

		const id = `share-kit-${String(dialogCount)}`;
		const parts = renderShareKit({
			capabilities: this.#capabilities,
			destinations: main,
			destinationsMore: more,
			icons: this.icons,
			id,
			payload,
			strings: this.#strings,
		});

		this.#qr = createShareQr({
			capabilities: this.#capabilities,
			closeIcon: this.icons.close,
			id: `${id}-qr`,
			payload,
			signal,
			strings: this.#strings,
		});

		if (this.#qr) parts.dialog.append(this.#qr.dialog);

		parts.dialog.addEventListener('close', this.#handleClose, { signal });
		polyfillLightDismiss(parts.dialog, signal);
		this.append(parts.dialog);
		this.#parts = parts;
		this.#destination = main[0] ?? shareDestinationAny;
		this.#syncDestination();

		return parts;
	}

	#report(outcome: ShareOutcome | undefined) {
		if (outcome && isKeyOf(outcomeMessages, outcome)) {
			this.#feedback?.announce(this.#strings[outcomeMessages[outcome]]);
		}
	}

	// A classic script in the head defines the element before its children are parsed
	#retryWhenParsed() {
		if (document.readyState !== 'loading') return;

		document.addEventListener(
			'DOMContentLoaded',
			() => {
				if (this.isConnected) this.connectedCallback();
			},
			{ once: true },
		);
	}

	async #saveAsset(tile: HTMLElement) {
		this.#track('save', tile);
		this.#report(await this.#files?.save(tile));
	}

	// An edited caption keeps the reader's words but swaps in the new destination's tagged link
	#selectDestination(id: ShareKitDestinationId) {
		const previousUrl = this.#getUrl();
		const caption = this.#parts?.caption;

		this.#destination = id;

		if (caption && this.#isCaptionEdited) {
			const url = this.#getUrl();

			caption.value = caption.value.replaceAll(previousUrl, () => url);
		}

		this.#syncDestination();
	}

	async #shareAssets(tiles: Array<HTMLElement>) {
		const [first] = tiles;

		if (!first) return;

		this.#track('share', first);
		this.#report(await this.#files?.share(tiles));
	}

	async #shareData(action: 'share-link' | 'share-text', data: ShareData) {
		this.#track(action);

		try {
			await navigator.share(data);
		} catch (error) {
			if (!isDomError(error, 'AbortError')) this.#feedback?.announce(this.#strings.error);
		}
	}

	#showMore(button: HTMLElement) {
		const hidden = [...this.querySelectorAll<HTMLElement>('[role="radio"][hidden]')];

		for (const radio of hidden) radio.hidden = false;

		button.hidden = true;
		hidden[0]?.focus();
	}

	#syncCaption() {
		const parts = this.#parts;

		if (!parts) return;

		const { isOver, message } = syncCaptionView({
			destination: this.#destination,
			parts,
			primaryAction: this.#getPrimaryAction(),
			strings: this.#strings,
		});

		if (isOver && !this.#isOver && parts.dialog.open) this.#feedback?.announce(message);

		this.#isOver = isOver;
	}

	#syncDestination() {
		const parts = this.#parts;
		const payload = this.#payload;

		if (!parts || !payload) return;

		syncDestinationView({
			assets: this.#getAssets(),
			destination: this.#destination,
			parts,
			strings: this.#strings,
			suggested: this.#getSuggestedAsset(),
		});

		if (!this.#isCaptionEdited) {
			parts.caption.value = fitCaption(
				{ description: payload.description, title: payload.title, url: this.#getUrl() },
				this.#destination,
				payload.locale,
			).text;
		}

		this.#syncCaption();
		this.#prefetch();
	}

	#track(action: ShareKitAction, tile?: HTMLElement) {
		const detail: ShareKitActionDetail = { action, destination: this.#destination };

		if (tile?.dataset.shareKitAsset) detail.asset = tile.dataset.shareKitAsset;

		this.dispatchEvent(
			new CustomEvent(shareKitActionEventName, { bubbles: true, composed: true, detail }),
		);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'share-kit': ShareKitElement;
	}
}
