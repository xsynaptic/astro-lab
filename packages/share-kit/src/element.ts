import type { ShareCapability } from './actions.js';
import type { ShareOutcome } from './assets.js';
import type { ShareKitActionKind, ShareKitDestination } from './destinations.js';
import type { ShareIconSource } from './icons.js';
import type { ShareKitParts } from './render.js';
import type { ShareKitStrings } from './strings.js';
import type { ShareKitAction, ShareKitActionDetail, ShareKitPayload } from './types.js';

import {
	clearOpenHash,
	getShareCapabilities,
	isOpenHash,
	openComposer,
	shareData,
} from './actions.js';
import { ShareAssetFiles } from './assets.js';
import { fitCaption } from './caption.js';
import { getDestinationUrl, getPrimaryAction } from './destinations.js';
import { patchIcons, polyfillLightDismiss, radioKeys } from './dom.js';
import { ShareFeedback } from './feedback.js';
import { getSuggestedImage } from './formats.js';
import { getShareAssets, getShareDestinations, readSharePayload } from './payload.js';
import { createShareQr } from './qr.js';
import { renderShareKit } from './render.js';
import { createNumberFormat, getShareStrings, shareKitStringDefaults } from './strings.js';
import { syncCaptionView, syncDestinationView } from './sync.js';
import { shareKitActionEventName } from './types.js';

type SettledAction = 'save' | 'share' | 'share-link' | 'share-text';

const iconIntentEvents = ['focusin', 'pointerdown', 'pointerover'] as const;

const outcomeMessages = {
	error: 'error',
	retry: 'retry',
	saved: 'saved',
	unsaved: 'saveError',
} as const satisfies Partial<Record<ShareOutcome, keyof ShareKitStrings<string>>>;

let dialogCount = 0;

function isKeyOf<Key extends string>(record: Record<Key, unknown>, key: string): key is Key {
	return Object.hasOwn(record, key);
}

// Server rendering has no `HTMLElement`; the stand-in lets the module load there and is never constructed
const BaseElement =
	typeof HTMLElement === 'undefined' ? (Object as unknown as typeof HTMLElement) : HTMLElement;

export abstract class ShareKitElement extends BaseElement {
	protected abstract readonly catalogue: ReadonlyMap<string, ShareKitDestination<string>>;
	protected abstract readonly iconSource: ShareIconSource;

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
			void this.#feedback?.copyText(this.#getUrl(), button);
		},
		destination: (button: HTMLElement) => {
			const destination = this.#getRendered(button.dataset.shareKitDestination);

			if (!destination) return;

			this.#selectDestination(destination);
			this.#track('destination');
		},
		primary: () => {
			this.#primaryActions[this.#getPrimaryAction()]();
		},
		qr: () => {
			void this.#openQr();
		},
		// Reset hides itself, which would drop focus to the page
		reset: () => {
			this.#isCaptionEdited = false;
			this.#syncDestination();
			this.#parts?.caption.focus();
		},
		save: (_button: HTMLElement, tile?: HTMLElement) => {
			if (tile) void this.#settle('save', this.#files?.save(tile), tile);
		},
		share: (_button: HTMLElement, tile?: HTMLElement) => {
			if (tile) void this.#settle('share', this.#files?.share([tile]), tile);
		},
	};
	#capabilities = new Set<ShareCapability>();
	#destination: ShareKitDestination<string> | undefined;
	#destinations: ReadonlyArray<ShareKitDestination<string>> | undefined;
	#feedback: ShareFeedback | undefined;
	#files: ShareAssetFiles | undefined;
	#isCaptionEdited = false;
	#isIconsRequested = false;
	#isOver = false;
	#numberFormat = new Intl.NumberFormat();
	#parts: ShareKitParts | undefined;
	#payload: ShareKitPayload<string> | undefined;
	#primaryActions = {
		'copy-caption': () => {
			this.#track('copy-caption');
			void this.#copyCaption();
		},
		// The composer can't always take the text, so it rides along on the clipboard
		'open-composer': () => {
			const href = this.#getComposerUrl();

			if (!href) return;

			this.#track('open-composer');
			void this.#copyCaption();
			openComposer(href);
		},
		'save-image': () => {
			const tile = this.#getSuggestedAsset();

			if (!tile) return;

			void this.#copyCaption();
			void this.#settle('save', this.#files?.save(tile), tile);
		},
		// Both start inside the tap, before any await, or the browser refuses one of them
		'share-image': () => {
			const tile = this.#getSuggestedAsset();

			if (!tile) return;

			void this.#copyCaption();
			void this.#settle('share', this.#files?.share([tile]), tile);
		},
		// The platform's app drops shared text too, so the caption rides on the clipboard as with an image
		'share-link': () => {
			void this.#copyCaption();
			void this.#settle('share-link', shareData({ url: this.#getUrl() }));
		},
		'share-text': () => {
			const text = this.#parts?.caption.value;

			if (text) void this.#settle('share-text', shareData({ text }));
		},
	} satisfies Record<ShareKitActionKind, () => void>;
	#qr: ReturnType<typeof createShareQr>;
	#strings: ShareKitStrings<string> = shareKitStringDefaults;

	connectedCallback() {
		if (this.#abortController) return;

		const payload = readSharePayload(this);

		if (!payload) {
			this.#retryWhenParsed();
			return;
		}

		const destinations = getShareDestinations(payload.settings, this.catalogue);

		if (!destinations) return;

		this.#abortController = new AbortController();
		this.#destinations = destinations;
		this.#payload = { ...payload, assets: getShareAssets(payload.assets) };
		this.#strings = getShareStrings(payload.strings ?? {}, new Set(this.catalogue.keys()));
		this.#numberFormat = createNumberFormat(payload.locale);
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

		for (const type of iconIntentEvents) {
			this.addEventListener(type, this.#handleTriggerIntent, { signal });
		}
		window.addEventListener('hashchange', this.#handleHashChange, { signal });
		// The trigger ships disabled so a tap before this runs isn't silently lost
		for (const trigger of this.querySelectorAll('[data-share-kit-trigger]')) {
			trigger.toggleAttribute('disabled', false);
		}

		// Deferred so a listener added after `defineShareKit()` in the same task still hears `open`
		queueMicrotask(() => {
			if (!signal.aborted && this.#ownsOpenHash()) this.#open();
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
		this.#destination = undefined;
		this.#destinations = undefined;
		this.#isCaptionEdited = false;
		this.#isIconsRequested = false;
		this.#isOver = false;
	}

	// A failed write selects the caption, so it is ready to copy by hand once the reader is back
	async #copyCaption(button?: HTMLElement) {
		const parts = this.#parts;

		if (!parts) return;

		const fallback = parts.captionSection.hidden ? undefined : parts.caption;

		await this.#feedback?.copyText(parts.caption.value, button, fallback);
	}

	#dispatch(detail: ShareKitActionDetail) {
		this.dispatchEvent(
			new CustomEvent(shareKitActionEventName, { bubbles: true, composed: true, detail }),
		);
	}

	#getAssets() {
		return (this.#parts?.tiles ?? []).filter((tile) => tile.dataset.shareKitState !== 'failed');
	}

	// `?:` rejects an explicit `undefined`, so the optional fields are spread in only when present
	#getComposerUrl() {
		const parts = this.#parts;
		const payload = this.#payload;
		const composer = this.#destination?.composer;

		if (!parts || !payload || !composer) return;

		const suggested = this.#getSuggestedAsset();
		const media = suggested ? parts.assets.get(suggested)?.src : undefined;

		return composer({
			...(payload.description === undefined ? {} : { description: payload.description }),
			device: this.#getDevice(),
			...(media === undefined ? {} : { media: new URL(media, location.href).href }),
			text: parts.caption.value,
			title: payload.title,
			url: this.#getUrl(),
		});
	}

	#getDetail(action: ShareKitAction, tile?: HTMLElement) {
		if (!this.#destination) return;

		const detail: ShareKitActionDetail = { action, destination: this.#destination.id };

		if (tile?.dataset.shareKitAsset) detail.asset = tile.dataset.shareKitAsset;

		return detail;
	}

	#getDevice() {
		return this.#capabilities.has('mobile') ? 'mobile' : 'desktop';
	}

	#getPrimaryAction() {
		const destination = this.#destination;

		if (!destination) return 'copy-caption';

		return getPrimaryAction(destination.actions[this.#getDevice()], {
			canShareFiles: this.#capabilities.has('files'),
			canShareText: this.#capabilities.has('link'),
			composerUrl: this.#getComposerUrl(),
			hasSuggestedImage: this.#getSuggestedAsset() !== undefined,
		});
	}

	#getRendered(id: string | undefined) {
		if (!id) return;

		return this.#destinations?.find((destination) => destination.id === id);
	}

	#getSuggestedAsset() {
		const parts = this.#parts;
		const destination = this.#destination;

		if (!parts || !destination) return;

		const tiles = this.#getAssets();
		const assets = tiles.flatMap((tile) => parts.assets.get(tile) ?? []);
		const suggested = getSuggestedImage(assets, destination.images);

		return tiles.find((tile) => parts.assets.get(tile) === suggested);
	}

	#getUrl() {
		const payload = this.#payload;
		const destination = this.#destination;

		if (!payload || !destination) return payload?.url ?? '';

		return getDestinationUrl(payload.url, destination, payload.settings.utmMedium);
	}

	#handleClick = (event: MouseEvent) => {
		if (!(event.target instanceof Element)) return;

		const trigger = event.target.closest<HTMLElement>('[data-share-kit-trigger]');

		if (trigger) {
			this.#open(trigger.dataset.shareKitTrigger);
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
		if (this.#ownsOpenHash()) this.#open();
	};

	#handleInput = (event: Event) => {
		if (event.target === this.#parts?.caption) this.#isCaptionEdited = true;

		this.#syncCaption();
	};

	#handleKeydown = (event: KeyboardEvent) => {
		const move = radioKeys[event.key];

		if (!move || !(event.target instanceof HTMLElement) || event.target.role !== 'radio') return;

		const radios = [...this.querySelectorAll<HTMLElement>('[role="radio"]')];
		const next = radios[move(radios.indexOf(event.target), radios.length)];
		const destination = this.#getRendered(next?.dataset.shareKitDestination);

		if (!next || !destination) return;

		event.preventDefault();
		this.#selectDestination(destination);
		next.focus();
	};

	#handlePreviewError = (event: Event) => {
		if (!(event.target instanceof HTMLImageElement)) return;

		const tile = event.target.closest<HTMLElement>('[data-share-kit-asset]');

		if (!tile) return;

		tile.dataset.shareKitState = 'failed';
		this.#syncDestination();
	};

	#handleTriggerIntent = ({ target }: Event) => {
		if (target instanceof Element && target.closest('[data-share-kit-trigger]')) this.#loadIcons();
	};

	#loadIcons() {
		const signal = this.#abortController?.signal;

		if (!signal || this.#isIconsRequested) return;

		this.#isIconsRequested = true;
		void this.iconSource.load().then((icons) => {
			if (!signal.aborted && this.#parts) patchIcons(this.#parts.dialog, icons);
		});
	}

	#open(destinationId?: string) {
		this.#loadIcons();

		const parts = this.#parts ?? this.#render();

		if (!parts || parts.dialog.open) return;

		const destination = this.#getRendered(destinationId);

		if (destination) this.#selectDestination(destination);

		parts.dialog.showModal();
		// Focusing the heading lets a screen reader start from the dialog's name
		parts.heading.focus();
		this.#track('open');
		// Synced again once open, since a status written to a closed dialog goes unannounced
		this.#isOver = false;
		parts.alert.textContent = '';
		this.#syncCaption();
	}

	async #openQr() {
		const qr = this.#qr;

		this.#track('qr');

		if (!qr) return;

		try {
			await qr.load();

			if (this.#parts?.dialog.open) qr.dialog.showModal();
		} catch {
			this.#feedback?.announce(this.#strings.error);
		}
	}

	#ownsOpenHash() {
		const openHash = this.#payload?.settings.openHash;

		if (!isOpenHash(openHash)) return false;

		for (const element of document.querySelectorAll(this.localName)) {
			if (element instanceof ShareKitElement && element.#payload?.settings.openHash === openHash) {
				return element === this;
			}
		}

		return false;
	}

	// The primary button shares the suggested image on a phone, so only that file is fetched ahead
	#prefetch() {
		if (!this.#capabilities.has('files') || !this.#capabilities.has('mobile')) return;

		const tile = this.#getSuggestedAsset();

		if (tile) void this.#files?.load(tile);
	}

	#render() {
		const payload = this.#payload;
		const destinations = this.#destinations;
		const signal = this.#abortController?.signal;

		if (!payload || !destinations || !signal) return;

		const { icons, isLoading } = this.iconSource;

		dialogCount += 1;

		const id = `share-kit-${String(dialogCount)}`;
		const parts = renderShareKit({
			capabilities: this.#capabilities,
			destinations,
			icons,
			id,
			isIconsLoading: isLoading,
			payload,
			strings: this.#strings,
		});

		this.#qr = createShareQr({
			capabilities: this.#capabilities,
			closeIcon: icons.close,
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
		this.#destination = destinations[0];
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

	// An edited caption keeps the reader's words but swaps in the new destination's tagged link
	#selectDestination(destination: ShareKitDestination<string>) {
		const previousUrl = this.#getUrl();
		const caption = this.#parts?.caption;

		this.#destination = destination;

		if (caption && this.#isCaptionEdited) {
			const url = this.#getUrl();

			caption.value = caption.value.replaceAll(previousUrl, () => url);
		}

		this.#syncDestination();
	}

	// Read before the await, since the reader can pick another destination while a slow file loads
	async #settle(
		action: SettledAction,
		pending: Promise<ShareOutcome> | undefined,
		tile?: HTMLElement,
	) {
		const detail = this.#getDetail(action, tile);
		const outcome = await pending;

		this.#report(outcome);

		if (!detail || !outcome) return;

		this.#dispatch({ ...detail, outcome: outcome === 'unsaved' ? 'error' : outcome });
	}

	#syncCaption() {
		const parts = this.#parts;
		const destination = this.#destination;

		if (!parts || !destination) return;

		const { isOver, message } = syncCaptionView({
			destination,
			isEdited: this.#isCaptionEdited,
			numberFormat: this.#numberFormat,
			parts,
			primaryAction: this.#getPrimaryAction(),
			strings: this.#strings,
		});

		const isAnnounced = isOver && parts.dialog.open;

		if (isAnnounced !== this.#isOver) parts.alert.textContent = isAnnounced ? message : '';

		this.#isOver = isAnnounced;
	}

	#syncDestination() {
		const parts = this.#parts;
		const payload = this.#payload;
		const destination = this.#destination;

		if (!parts || !payload || !destination) return;

		syncDestinationView({
			assets: this.#getAssets(),
			destination,
			parts,
			strings: this.#strings,
			suggested: this.#getSuggestedAsset(),
			url: this.#getUrl(),
		});

		if (!this.#isCaptionEdited) {
			parts.caption.value = fitCaption(
				{ description: payload.description, title: payload.title, url: this.#getUrl() },
				destination,
				payload.locale,
			).text;
		}

		this.#syncCaption();
		this.#prefetch();
	}

	#track(action: Exclude<ShareKitAction, SettledAction>, tile?: HTMLElement) {
		const detail = this.#getDetail(action, tile);

		if (detail) this.#dispatch(detail);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'share-kit': ShareKitElement;
	}
}
