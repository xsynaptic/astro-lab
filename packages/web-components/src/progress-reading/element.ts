import { BaseElement } from '../shared/base-element.js';
import { setProgress, setProgressActive } from '../shared/progress.js';
import { getReadingProgress } from './measure.js';

export const progressReadingElementName = 'progress-reading';

const defaultTarget = '[data-reading-frame]';

export class ProgressReadingElement extends BaseElement {
	#frame: number | undefined;
	#observer: IntersectionObserver | undefined;
	#scrollAbortController: AbortController | undefined;
	#target: Element | undefined;

	connectedCallback() {
		if (this.#observer) return;

		this.#target =
			document.querySelector(this.getAttribute('target') ?? defaultTarget) ?? undefined;

		if (!this.#target) return;

		this.#observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						this.#trackScroll();
					} else {
						this.#untrackScroll();
					}
				}
			},
			{ threshold: 0 },
		);
		this.#observer.observe(this.#target);
	}

	disconnectedCallback() {
		this.#observer?.disconnect();
		this.#observer = undefined;
		this.#target = undefined;
		this.#untrackScroll();

		if (this.#frame === undefined) return;

		cancelAnimationFrame(this.#frame);
		this.#frame = undefined;
	}

	#handleScroll = () => {
		if (this.#frame !== undefined) return;

		this.#frame = requestAnimationFrame(this.#update);
	};

	#trackScroll() {
		if (this.#scrollAbortController) return;

		this.#scrollAbortController = new AbortController();

		const { signal } = this.#scrollAbortController;

		window.addEventListener('resize', this.#handleScroll, { passive: true, signal });
		window.addEventListener('scroll', this.#handleScroll, { passive: true, signal });
		this.#handleScroll();
	}

	#untrackScroll() {
		this.#scrollAbortController?.abort();
		this.#scrollAbortController = undefined;
	}

	#update = () => {
		this.#frame = undefined;

		if (!this.#target) return;

		const rect = this.#target.getBoundingClientRect();
		const { scrollPaddingTop } = getComputedStyle(document.documentElement);
		const progress = getReadingProgress({
			coveredBand: Number(scrollPaddingTop.replace('px', '')) || 0,
			frameHeight: rect.height,
			frameTop: rect.top,
			viewportHeight: window.innerHeight,
		});

		setProgress(this, progress);
		setProgressActive(this, progress < 1);
	};
}

declare global {
	interface HTMLElementTagNameMap {
		'progress-reading': ProgressReadingElement;
	}
}
