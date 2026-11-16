import { BaseElement } from '../shared/base-element.js';
import { getTopButtonVisibility } from './visibility.js';

export const topButtonElementName = 'top-button';

export const topButtonActivateEvent = 'top-button:activate';

export interface TopButtonActivateDetail {
	focusTarget: HTMLElement | null;
}

export class TopButtonElement extends BaseElement {
	#abortController: AbortController | undefined;
	#accumulator = 0;
	#animationFrameId: number | undefined;
	#lastScrollY = 0;
	#resizeObserver: ResizeObserver | undefined;
	#scrollAbortController: AbortController | undefined;

	connectedCallback() {
		if (this.#abortController) return;

		this.#abortController = new AbortController();
		this.inert = true;
		this.addEventListener('click', this.#handleClick, { signal: this.#abortController.signal });
		this.#resizeObserver = new ResizeObserver(this.#handleResize);
		this.#resizeObserver.observe(this);
	}

	disconnectedCallback() {
		this.#abortController?.abort();
		this.#abortController = undefined;
		this.#resizeObserver?.disconnect();
		this.#resizeObserver = undefined;
		this.#detachScroll();
	}

	#attachScroll() {
		if (this.#scrollAbortController) return;

		this.#scrollAbortController = new AbortController();
		this.#lastScrollY = window.scrollY;
		this.#accumulator = 0;

		window.addEventListener('scroll', this.#handleScroll, {
			passive: true,
			signal: this.#scrollAbortController.signal,
		});
	}

	#detachScroll() {
		this.#scrollAbortController?.abort();
		this.#scrollAbortController = undefined;

		if (this.#animationFrameId === undefined) return;

		cancelAnimationFrame(this.#animationFrameId);
		this.#animationFrameId = undefined;
	}

	#getFocusTarget() {
		const selector = this.getAttribute('target');
		const element = selector ? document.querySelector(selector) : null;

		return element instanceof HTMLElement ? element : null;
	}

	#handleClick = () => {
		const focusTarget = this.#getFocusTarget();
		const event = new CustomEvent<TopButtonActivateDetail>(topButtonActivateEvent, {
			bubbles: true,
			cancelable: true,
			detail: { focusTarget },
		});

		if (!this.dispatchEvent(event)) return;

		const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		window.scrollTo({ behavior: isReducedMotion ? 'instant' : 'smooth', top: 0 });

		if (!focusTarget) return;

		focusTarget.focus({ preventScroll: true });

		if (document.activeElement === focusTarget || focusTarget.hasAttribute('tabindex')) return;

		focusTarget.tabIndex = -1;
		focusTarget.focus({ preventScroll: true });
	};

	#handleResize = (entries: Array<ResizeObserverEntry>) => {
		const size = entries.at(-1)?.borderBoxSize[0];

		if (size && size.inlineSize > 0 && size.blockSize > 0) {
			this.#attachScroll();
			return;
		}

		this.#detachScroll();
		this.inert = true;
	};

	#handleScroll = () => {
		if (this.#animationFrameId !== undefined) return;

		this.#animationFrameId = requestAnimationFrame(this.#update);
	};

	#update = () => {
		this.#animationFrameId = undefined;

		const scrollY = window.scrollY;
		const { accumulator, isHidden } = getTopButtonVisibility({
			accumulator: this.#accumulator,
			isHidden: this.inert,
			lastScrollY: this.#lastScrollY,
			pageHeight: document.documentElement.scrollHeight,
			scrollY,
			viewportHeight: window.innerHeight,
		});

		this.#accumulator = accumulator;
		this.#lastScrollY = scrollY;

		if (this.inert !== isHidden) this.inert = isHidden;
	};
}

declare global {
	interface DocumentEventMap {
		'top-button:activate': CustomEvent<TopButtonActivateDetail>;
	}

	interface HTMLElementEventMap {
		'top-button:activate': CustomEvent<TopButtonActivateDetail>;
	}

	interface HTMLElementTagNameMap {
		'top-button': TopButtonElement;
	}
}
