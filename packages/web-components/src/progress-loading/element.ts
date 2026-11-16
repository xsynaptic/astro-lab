import { BaseElement } from '../shared/base-element.js';
import { setProgress, setProgressActive } from '../shared/progress.js';
import { getNextTrickle } from './trickle.js';

export const progressLoadingElementName = 'progress-loading';

const startProgress = 0.2;
const thresholdMilliseconds = 200;
const trickleIntervalMilliseconds = 300;

function flushStyle(element: Element) {
	getComputedStyle(element).getPropertyValue('opacity');
}

function getNavigationSignal(event: Event) {
	return 'signal' in event && event.signal instanceof AbortSignal ? event.signal : undefined;
}

function isOpacityTransition(animation: Animation) {
	return animation instanceof CSSTransition && animation.transitionProperty === 'opacity';
}

export class ProgressLoadingElement extends BaseElement {
	#abortController: AbortController | undefined;
	#isLoading = false;
	#isSwapping = false;
	#progress = startProgress;
	#thresholdTimeout: number | undefined;
	#trickleInterval: number | undefined;

	connectedCallback() {
		if (this.#abortController) return;

		this.#abortController = new AbortController();

		const { signal } = this.#abortController;

		document.addEventListener('astro:before-preparation', this.#handlePreparation, { signal });
		document.addEventListener('astro:before-swap', this.#handleBeforeSwap, { signal });
		document.addEventListener('astro:after-swap', this.#handleAfterSwap, { signal });
		window.addEventListener('pagehide', this.#handlePageHide, { signal });
	}

	disconnectedCallback() {
		this.#abortController?.abort();
		this.#abortController = undefined;
		this.#clearLoadTimers();
	}

	#clearLoadTimers() {
		window.clearTimeout(this.#thresholdTimeout);
		window.clearInterval(this.#trickleInterval);
		this.#thresholdTimeout = undefined;
		this.#trickleInterval = undefined;
	}

	#handleAbandon = () => {
		if (!this.#isLoading) return;

		this.#isLoading = false;
		this.#clearLoadTimers();
		setProgressActive(this, false);
		void this.#resetAfterFade();
	};

	#handleAfterSwap = () => {
		if (!this.#isSwapping) return;

		this.#isSwapping = false;
		flushStyle(this);
		setProgressActive(this, false);
		void this.#resetAfterFade();
	};

	#handleBeforeSwap = () => {
		if (!this.#isLoading) return;

		this.#isLoading = false;
		this.#isSwapping = true;
		this.#clearLoadTimers();
		this.#progress = 1;
		setProgress(this, 1);
	};

	#handlePageHide = () => {
		if (!this.#isLoading) return;

		this.#isLoading = false;
		this.#clearLoadTimers();
		this.#progress = startProgress;
		setProgress(this, startProgress);
		setProgressActive(this, false);

		for (const animation of this.getAnimations()) {
			if (animation instanceof CSSTransition) animation.finish();
		}
	};

	#handlePreparation = (event: Event) => {
		this.#clearLoadTimers();
		this.#isLoading = true;
		this.#progress = startProgress;
		getNavigationSignal(event)?.addEventListener('abort', this.#handleAbandon, { once: true });
		this.#thresholdTimeout = window.setTimeout(() => {
			this.#thresholdTimeout = undefined;
			setProgress(this, startProgress);
			setProgressActive(this, true);
			this.#trickleInterval = window.setInterval(() => {
				this.#progress = getNextTrickle(this.#progress, Math.random());
				setProgress(this, this.#progress);
			}, trickleIntervalMilliseconds);
		}, thresholdMilliseconds);
	};

	async #resetAfterFade() {
		const fade = this.getAnimations().find((animation) => isOpacityTransition(animation));

		try {
			await fade?.finished;
		} catch {
			return;
		}

		if (this.#isLoading) return;

		this.#progress = startProgress;
		setProgress(this, startProgress);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'progress-loading': ProgressLoadingElement;
	}
}
