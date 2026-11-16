import type {
	PagefindComponentUi,
	PagefindInstance,
	PagefindModalTrigger,
} from './pagefind-component-ui.js';
import type { SearchSession, SearchToggleSearchDetail } from './search-session.js';

import { createSearchSession, getResultCount } from './search-session.js';

export type { SearchToggleSearchDetail } from './search-session.js';

export const searchToggleSearchEventName = 'search-toggle:search';

const tagName = 'search-toggle';

const isMac = typeof navigator !== 'undefined' && /mac/iu.test(navigator.userAgent);

// One per instance, which outlives every toggle a ClientRouter navigation replaces
const searchSessions = new WeakMap<PagefindInstance, SearchSession>();

function getSearchSession(instance: PagefindInstance) {
	const existing = searchSessions.get(instance);

	if (existing) return existing;

	// On `document`, since an abandoned search ends after the toggle has left it
	const session = createSearchSession((detail) => {
		document.dispatchEvent(new CustomEvent(searchToggleSearchEventName, { detail }));
	});

	// A debounced search can land after the modal closes, and an inline input may share the instance
	instance.on('results', (result) => {
		const [modal] = instance.getUtilities('modal');

		if (!modal?.isOpen) return;

		session.update(instance.searchTerm, getResultCount(result));
	});
	searchSessions.set(instance, session);

	return session;
}

// The composed path reaches an input inside a shadow root, where `event.target` is its host
function isTypingTarget(event: KeyboardEvent) {
	const [target] = event.composedPath();

	if (!(target instanceof HTMLElement)) return false;

	return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

// Exactly ⌘K or Ctrl+K, as Pagefind's own trigger matches, so combinations like Ctrl+Shift+K stay the browser's
function isShortcut(event: KeyboardEvent) {
	if (event.key.toLowerCase() !== 'k' || event.shiftKey || event.altKey) return false;

	return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

const stylesheetLoads = new WeakMap<HTMLLinkElement, Promise<void>>();

// Looked up on every call, since a ClientRouter head swap removes the link a toggle added earlier
function loadStylesheet(href: null | string) {
	if (!href) return Promise.resolve();

	let link = document.querySelector<HTMLLinkElement>('link[data-pagefind-css]');

	if (!link) {
		link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = href;
		link.dataset.pagefindCss = '';
		document.head.append(link);
	}

	const existing = stylesheetLoads.get(link);

	if (existing) return existing;

	const load = link.sheet
		? Promise.resolve()
		: new Promise<void>((resolve) => {
				// An error still resolves, so the modal opens unstyled rather than never
				link.addEventListener(
					'load',
					() => {
						resolve();
					},
					{ once: true },
				);
				link.addEventListener(
					'error',
					() => {
						resolve();
					},
					{ once: true },
				);
			});

	stylesheetLoads.set(link, load);

	return load;
}

// Pagefind appends its live regions to `body` once per instance, so without this a swap leaves it announcing to nothing
function keepAnnouncersAcrossSwaps() {
	document.addEventListener('astro:before-swap', (event) => {
		if (!('newDocument' in event) || !(event.newDocument instanceof Document)) return;

		event.newDocument.body.append(...document.querySelectorAll('[data-pagefind-announcer]'));
	});
}

// Server rendering has no `HTMLElement`; the stand-in lets the module load there and is never constructed
const BaseElement =
	typeof HTMLElement === 'undefined' ? (Object as unknown as typeof HTMLElement) : HTMLElement;

class SearchToggleElement extends BaseElement implements PagefindModalTrigger {
	// Public like every Pagefind component's, so tests can count the instance's registrations
	instance: PagefindInstance | undefined;

	get buttonEl() {
		return this.querySelector('button');
	}

	#abortController: AbortController | undefined;
	#session: SearchSession | undefined;

	connectedCallback() {
		this.#abortController = new AbortController();

		const { signal } = this.#abortController;

		// The one ARIA value markup can't carry, since it depends on the visitor's platform
		this.buttonEl?.setAttribute('aria-keyshortcuts', isMac ? 'Meta+K' : 'Control+K');

		this.addEventListener('pointerenter', this.#preload, { once: true, signal });
		this.addEventListener('focusin', this.#preload, { once: true, signal });
		this.addEventListener('click', this.#handleClick, { signal });
		document.addEventListener('keydown', this.#handleKeydown, { signal });
		// Capture, so no handler that stops the click's propagation can hide a result click
		document.addEventListener('click', this.#handleResultClick, { capture: true, signal });
	}

	disconnectedCallback() {
		this.#session?.end(false);
		this.instance?.deregisterAllShortcuts(this);
		this.instance?.unregisterComponent(this);
		this.instance = undefined;
		this.#session = undefined;
		this.#abortController?.abort();
		this.#abortController = undefined;
	}

	// Called by <pagefind-modal> when it closes
	handleModalClose() {
		this.#session?.end(false);
		this.buttonEl?.setAttribute('aria-expanded', 'false');
		this.buttonEl?.focus();

		if (this.instance?.getUtilities('modal')[0]?.resetOnClose) this.instance.triggerSearch('');
	}

	#handleClick = () => {
		void this.#open();
	};

	#handleKeydown = (event: KeyboardEvent) => {
		if (event.defaultPrevented || !isShortcut(event) || isTypingTarget(event)) return;

		event.preventDefault();
		void this.#open();
	};

	#handleResultClick = (event: MouseEvent) => {
		if (!(event.target instanceof Element)) return;
		if (!event.target.closest('pagefind-results a[href]')) return;

		this.#session?.end(true);
	};

	// Awaits both so the modal never opens unstyled, and never without this trigger to hear it close
	async #open() {
		await Promise.all([loadStylesheet(this.getAttribute('stylesheet')), this.#register()]);

		const [modal] = this.instance?.getUtilities('modal') ?? [];

		modal?.open();
	}

	#preload = () => {
		void loadStylesheet(this.getAttribute('stylesheet'));
		void this.#register();
	};

	// Importing defines the <pagefind-*> elements, which upgrade and register themselves before it resolves
	async #register() {
		const { getInstanceManager } =
			(await import('@pagefind/component-ui')) as unknown as PagefindComponentUi;

		if (this.instance || !this.#abortController) return;

		const instance = getInstanceManager().getInstance(this.getAttribute('instance') ?? 'default');

		this.instance = instance;
		this.#session = getSearchSession(instance);
		instance.registerUtility(this, 'modal-trigger');
		instance.registerShortcut(
			{
				description: this.getAttribute('shortcut-description') ?? '',
				label: isMac ? '⌘K' : 'Ctrl+K',
			},
			this,
		);
	}
}

export type { SearchToggleElement };

export function defineSearchToggle() {
	if (customElements.get(tagName)) return;

	customElements.define(tagName, SearchToggleElement);
	keepAnnouncersAcrossSwaps();
}

declare global {
	interface GlobalEventHandlersEventMap {
		[searchToggleSearchEventName]: CustomEvent<SearchToggleSearchDetail>;
	}

	interface HTMLElementTagNameMap {
		'search-toggle': SearchToggleElement;
	}
}
