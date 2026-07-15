import { html } from './dom-tags.js';
import { scriptLabel } from './scripts.js';

const minPanelHeight = 140;

// A multi-select checkbox dropdown for scripts. Lives in the toolbar's bottom bar
// Its panel floats free at the shadow-root level so it escapes the window's clipped box and opens upward
// Emits a `change` CustomEvent ({ selected: string[] }) when the selection moves
class FontScriptSelect extends HTMLElement {
	private available: Array<string> = [];
	private controller: AbortController | undefined;
	private list!: HTMLDivElement;
	private panel!: HTMLDivElement;
	private ready = false;
	private root!: ShadowRoot;
	private search!: HTMLInputElement;
	private selected = new Set<string>();
	private trigger!: HTMLElement;

	connectedCallback(): void {
		this.innerHTML = html`
			<astro-dev-toolbar-button
				button-style="gray"
				size="small"
				aria-haspopup="true"
				aria-expanded="false"
			></astro-dev-toolbar-button>
		`;
		const trigger = this.querySelector<HTMLElement>('astro-dev-toolbar-button');

		if (!trigger) return;

		this.trigger = trigger;

		this.root = this.getRootNode() as ShadowRoot;
		this.panel = document.createElement('div');
		this.panel.className = 'fdt-scripts-panel';
		this.panel.hidden = true;
		this.panel.innerHTML = html`
			<div class="fdt-scripts-head">
				<input
					type="text"
					class="fdt-scripts-search"
					placeholder="Filter scripts..."
					autocomplete="off"
					spellcheck="false"
				/>
				<button type="button" class="fdt-scripts-clear">Clear</button>
			</div>
			<div class="fdt-scripts-list" role="listbox" aria-multiselectable="true"></div>
		`;
		const search = this.panel.querySelector<HTMLInputElement>('.fdt-scripts-search');
		const list = this.panel.querySelector<HTMLDivElement>('.fdt-scripts-list');
		const clearButton = this.panel.querySelector<HTMLButtonElement>('.fdt-scripts-clear');
		if (!search || !list || !clearButton) return;
		this.search = search;
		this.list = list;
		this.root.append(this.panel);

		this.controller = new AbortController();
		const { signal } = this.controller;

		this.trigger.addEventListener(
			'click',
			() => {
				if (this.panel.hidden) this.open();
				else this.close();
			},
			{ signal },
		);

		this.search.addEventListener(
			'input',
			() => {
				this.renderList();
			},
			{ signal },
		);

		clearButton.addEventListener(
			'click',
			() => {
				this.selected.clear();
				this.renderList();
				this.updateTrigger();
				this.emit();
			},
			{ signal },
		);

		this.list.addEventListener(
			'change',
			(event) => {
				const checkbox = event.target;
				if (!(checkbox instanceof HTMLInputElement)) return;
				const script = checkbox.dataset.script;
				if (!script) return;
				if (checkbox.checked) this.selected.add(script);
				else this.selected.delete(script);
				this.updateTrigger();
				this.emit();
			},
			{ signal },
		);

		document.addEventListener('click', this.onDocumentClick, { capture: true, signal });
		globalThis.addEventListener('resize', this.reposition, { signal });
		this.root.addEventListener('scroll', this.reposition, { capture: true, passive: true, signal });

		this.renderList();
		this.updateTrigger();
		this.ready = true;
	}

	disconnectedCallback(): void {
		this.controller?.abort();
		this.panel.remove();
		this.ready = false;
	}

	getSelected(): Array<string> {
		return [...this.selected];
	}

	setAvailable(scripts: Array<string>): void {
		this.available = scripts;
		if (!this.ready) return;
		this.renderList();
		this.updateTrigger();
	}

	setSelected(scripts: Array<string>): void {
		this.selected = new Set(scripts);
		if (!this.ready) return;
		this.renderList();
		this.updateTrigger();
	}

	private close(): void {
		this.panel.hidden = true;
		this.trigger.setAttribute('aria-expanded', 'false');
	}

	private emit(): void {
		this.dispatchEvent(new CustomEvent('change', { detail: { selected: this.getSelected() } }));
	}

	private readonly onDocumentClick = (event: Event): void => {
		if (this.panel.hidden) return;
		const path = event.composedPath();
		if (!path.includes(this.panel) && !path.includes(this)) this.close();
	};

	private open(): void {
		this.panel.hidden = false;
		this.trigger.setAttribute('aria-expanded', 'true');
		this.renderList();
		this.position();
		this.search.focus();
	}

	private position(): void {
		const rect = this.trigger.getBoundingClientRect();
		const style = this.panel.style;
		const margin = 8;
		style.top = 'auto';
		style.bottom = `${String(Math.round(globalThis.innerHeight - rect.top + 4))}px`;
		style.maxHeight = `${String(Math.round(Math.max(minPanelHeight, rect.top - 12)))}px`;
		const panelWidth = this.panel.offsetWidth;
		const isOverflowsRight = rect.left + panelWidth > globalThis.innerWidth - margin;
		const left = isOverflowsRight ? rect.right - panelWidth : rect.left;
		style.left = `${String(Math.round(Math.max(margin, left)))}px`;
	}

	private renderList(): void {
		const query = this.search.value.toLowerCase().trim();
		const fragment = document.createDocumentFragment();

		for (const script of this.available) {
			if (query && !scriptLabel(script).toLowerCase().includes(query) && !script.includes(query)) {
				continue;
			}

			const label = document.createElement('label');
			label.className = 'fdt-scripts-item';
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.dataset.script = script;
			checkbox.checked = this.selected.has(script);
			label.append(checkbox, scriptLabel(script));
			fragment.append(label);
		}

		this.list.replaceChildren(fragment);
	}

	private readonly reposition = (): void => {
		if (!this.panel.hidden) this.position();
	};

	private updateTrigger(): void {
		const count = this.selected.size;

		if (count === 0) {
			this.trigger.textContent = 'All scripts';

			return;
		}

		const [first] = this.getSelected();

		if (!first) return;

		this.trigger.textContent =
			count > 1 ? `${scriptLabel(first)} +${String(count - 1)}` : scriptLabel(first);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'font-script-select': FontScriptSelect;
	}
}

if (!customElements.get('font-script-select')) {
	customElements.define('font-script-select', FontScriptSelect);
}
