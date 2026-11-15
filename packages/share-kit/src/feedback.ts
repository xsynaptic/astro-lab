import type { ShareKitStrings } from './strings.js';

import { copyImage } from './actions.js';

const statusDurationMs = 4000;

const flashDurationMs = 2000;

export class ShareFeedback {
	#flashing = new WeakSet<HTMLElement>();
	#getStatus: () => HTMLElement | undefined;
	#strings: ShareKitStrings;
	#timeout: ReturnType<typeof setTimeout> | undefined;

	constructor(getStatus: () => HTMLElement | undefined, strings: ShareKitStrings) {
		this.#getStatus = getStatus;
		this.#strings = strings;
	}

	announce(message: string) {
		const status = this.#getStatus();

		if (!status) return;

		status.textContent = message;

		clearTimeout(this.#timeout);
		this.#timeout = setTimeout(() => {
			status.textContent = '';
		}, statusDurationMs);
	}

	// Safari only allows the clipboard write if it starts inside the click, before any await
	async copyImage(file: Promise<File | undefined>, button: HTMLElement) {
		try {
			await copyImage(file);
			this.#flash(button);
		} catch {
			this.announce(this.#strings.error);
		}
	}

	async copyText(text: string, button?: HTMLElement, fallback?: HTMLTextAreaElement) {
		try {
			await navigator.clipboard.writeText(text);
			this.#flash(button);
		} catch {
			fallback?.select();
			this.announce(fallback ? this.#strings.copyManual : this.#strings.error);
		}
	}

	dispose() {
		clearTimeout(this.#timeout);
	}

	#flash(button: HTMLElement | undefined) {
		this.announce(this.#strings.copied);

		if (!button || this.#flashing.has(button)) return;

		const label = button.textContent;

		this.#flashing.add(button);
		button.textContent = this.#strings.copied;

		setTimeout(() => {
			button.textContent = label;
			this.#flashing.delete(button);
		}, flashDurationMs);
	}
}
