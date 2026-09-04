import type { PathEntry, PathSuggestion } from './index.js';

import { getPathSuggestions, pathSuggestionDefaults } from './index.js';

export const pathSuggestionsElementName = 'path-suggestions';

export const pathSuggestionsRedirectEvent = 'path-suggestions:redirect';
export const pathSuggestionsDoneEvent = 'path-suggestions:done';

export interface PathSuggestionsDoneDetail {
	count: number;
}

export interface PathSuggestionsRedirectDetail {
	url: string;
}

type PathSuggestionsState = 'empty' | 'list' | 'redirect';

// A path this short carries too little signal to score against anything
const defaultMinLength = 3;

// Marks the list this element owns, so host-authored children survive a re-render
const listAttribute = 'data-path-suggestions-list';

export class PathSuggestionsElement extends HTMLElement {
	// Score against an inlined list instead of fetching one; scoring reruns when set after connection
	get entries(): Array<PathEntry> | undefined {
		return this.#entries;
	}

	set entries(value: Array<PathEntry> | undefined) {
		this.#entries = value;

		if (this.isConnected) void this.run();
	}

	#entries: Array<PathEntry> | undefined;

	constructor() {
		super();

		// A value assigned before this element upgraded sits in an own property, shadowing the accessor
		if (Object.hasOwn(this, 'entries')) {
			this.#entries = this.entries;
			Reflect.deleteProperty(this, 'entries');
		}
	}

	connectedCallback(): void {
		void this.run();
	}

	async run(): Promise<void> {
		this.dataset.state = 'loading';

		const path = globalThis.location.pathname;

		if (path.length < this.readNumber('min-length', defaultMinLength)) {
			this.finish(0, 'empty');
			return;
		}

		const entries = this.entries ?? (await this.fetchEntries());

		if (!entries) {
			this.finish(0, 'empty');
			return;
		}

		const result = getPathSuggestions({
			entries,
			limit: this.readNumber('limit', pathSuggestionDefaults.limit),
			path,
			redirectThreshold: this.readNumber(
				'redirect-threshold',
				pathSuggestionDefaults.redirectThreshold,
			),
			threshold: this.readNumber('threshold', pathSuggestionDefaults.threshold),
		});

		if (!result) {
			this.finish(0, 'empty');
			return;
		}

		if (result.type === 'redirect') {
			this.redirect(result.url);
			return;
		}

		this.render(result.items);
		this.finish(result.items.length, 'list');
	}

	private async fetchEntries(): Promise<Array<PathEntry> | undefined> {
		const source = this.getAttribute('src');

		if (!source) return;

		try {
			const response = await fetch(source);

			if (!response.ok) return;

			const entries: unknown = await response.json();

			return Array.isArray(entries) ? (entries as Array<PathEntry>) : undefined;
		} catch {
			return;
		}
	}

	private finish(count: number, state: PathSuggestionsState): void {
		this.dataset.state = state;
		this.dispatchEvent(
			new CustomEvent<PathSuggestionsDoneDetail>(pathSuggestionsDoneEvent, {
				bubbles: true,
				detail: { count },
			}),
		);
	}

	private getList(): HTMLUListElement {
		const existing = this.querySelector<HTMLUListElement>(`ul[${CSS.escape(listAttribute)}]`);

		if (existing) return existing;

		const list = document.createElement('ul');

		list.setAttribute(listAttribute, '');
		this.append(list);

		return list;
	}

	private readNumber(attribute: string, fallback: number): number {
		const raw = this.getAttribute(attribute);

		if (raw === null) return fallback;

		const parsed = Number(raw);

		return Number.isFinite(parsed) ? parsed : fallback;
	}

	// Cancel the event to navigate some other way, such as an SPA router
	private redirect(url: string): void {
		const event = new CustomEvent<PathSuggestionsRedirectDetail>(pathSuggestionsRedirectEvent, {
			bubbles: true,
			cancelable: true,
			detail: { url },
		});

		const isProceed = this.dispatchEvent(event);

		this.finish(1, 'redirect');

		if (isProceed) globalThis.location.replace(url);
	}

	private render(items: Array<PathSuggestion>): void {
		const list = this.getList();
		const linkClass = this.getAttribute('link-class');

		list.replaceChildren();

		for (const item of items) {
			const listItem = document.createElement('li');
			const link = document.createElement('a');

			link.href = item.url;
			link.textContent = item.title;

			if (linkClass) link.className = linkClass;

			listItem.append(link);
			list.append(listItem);
		}
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'path-suggestions': PathSuggestionsElement;
	}
}

if (!customElements.get(pathSuggestionsElementName)) {
	customElements.define(pathSuggestionsElementName, PathSuggestionsElement);
}
