import { icons } from '../shared/icons.js';
import { html } from './dom-tags.js';
import { rowHeight } from './tokens.js';

export interface ComboboxOption {
	category: string;
	family: string;
	variable: boolean;
}

const bufferRows = 6; // Extra rows rendered above and below the visible window
const minDropdownHeight = 120;

let comboboxCount = 0;

// Row markup, cloned per visible option. Filling via textContent keeps family names injection-safe
const rowTemplate = document.createElement('template');
rowTemplate.innerHTML = html`
	<div class="fdt-option" role="option">
		<span class="fdt-fam"></span><span class="fdt-var">VAR</span>
	</div>
`;

class FontCombobox extends HTMLElement {
	private activeIndex = -1;
	private allOptions: Array<ComboboxOption> = [];
	private blurTimer: ReturnType<typeof setTimeout> | undefined;
	private category = 'all';
	private clearButton!: HTMLButtonElement;
	private controller: AbortController | undefined;
	private filtered: Array<ComboboxOption> = [];
	private input!: HTMLInputElement;
	private list!: HTMLDivElement;
	private rafId: number | undefined;
	private ready = false;
	private root!: ShadowRoot;
	private selectedFamily = '';
	private sizer!: HTMLDivElement;
	private readonly uid = ++comboboxCount;

	connectedCallback(): void {
		const listId = `fdt-listbox-${String(this.uid)}`;
		this.innerHTML = html`
			<div class="fdt-combobox">
				<input
					type="text"
					role="combobox"
					aria-label="Font family"
					aria-autocomplete="list"
					aria-expanded="false"
					aria-controls="${listId}"
					placeholder="Type to filter..."
					autocomplete="off"
					spellcheck="false"
				/>
				<button type="button" class="fdt-combo-clear" aria-label="Clear font" tabindex="-1" hidden>
					${icons.close}
				</button>
			</div>
		`;
		const input = this.querySelector<HTMLInputElement>('input');
		const clearButton = this.querySelector<HTMLButtonElement>('.fdt-combo-clear');
		if (!input || !clearButton) return;
		this.input = input;
		this.clearButton = clearButton;

		// The list floats free of the dev-toolbar window:
		// It lives at the shadow-root level (outside the window's clipped, transformed box) and is positioned with fixed coordinates so it can open up or down and use the full viewport height
		this.root = this.getRootNode() as ShadowRoot;
		this.list = document.createElement('div');
		this.list.id = listId;
		this.list.className = 'fdt-dropdown';
		this.list.setAttribute('role', 'listbox');
		this.list.hidden = true;

		// Virtual scroll: the sizer is as tall as the whole filtered list so the scrollbar is real, but only the rows inside the visible window are ever in the DOM (absolutely positioned)
		this.sizer = document.createElement('div');
		this.sizer.className = 'fdt-sizer';
		this.list.append(this.sizer);
		this.root.append(this.list);

		this.controller = new AbortController();
		const { signal } = this.controller;

		this.input.addEventListener(
			'input',
			() => {
				this.openDropdown();
				this.applyFilter();
				this.updateClearVisibility();
			},
			{ signal },
		);
		this.clearButton.addEventListener(
			'click',
			() => {
				this.clearSelection();
			},
			{ signal },
		);
		this.input.addEventListener(
			'change',
			(event) => {
				// The input's native change event would otherwise bubble to the host and collide with this component's own semantic `change` CustomEvent (whose listener reads event.detail)
				event.stopPropagation();
			},
			{ signal },
		);
		this.input.addEventListener(
			'focus',
			() => {
				// Select the current family so re-focusing after a pick lets you type a fresh search
				this.input.select();
				this.openDropdown();
			},
			{ signal },
		);
		this.input.addEventListener(
			'blur',
			() => {
				this.blurTimer = setTimeout(() => {
					this.closeDropdown();
				}, 150);
			},
			{ signal },
		);
		this.input.addEventListener(
			'keydown',
			(event) => {
				this.handleKey(event);
			},
			{ signal },
		);

		this.list.addEventListener(
			'mousedown',
			(event) => {
				if (!(event.target instanceof HTMLElement)) return;
				const row = event.target.closest<HTMLElement>('[data-index]');
				if (!row) return;
				event.preventDefault(); // Keep input focus so the blur handler doesn't close before select
				this.selectIndex(Number(row.dataset.index));
			},
			{ signal },
		);
		this.list.addEventListener('scroll', this.onScroll, { passive: true, signal });

		globalThis.addEventListener('resize', this.reposition, { signal });
		this.root.addEventListener('scroll', this.reposition, { capture: true, passive: true, signal });

		this.applyFilter();
		if (this.selectedFamily) {
			this.input.value = this.selectedFamily;
			this.updateClearVisibility();
		}

		this.ready = true;
	}

	disconnectedCallback(): void {
		this.controller?.abort();
		if (this.blurTimer !== undefined) clearTimeout(this.blurTimer);
		if (this.rafId !== undefined) cancelAnimationFrame(this.rafId);
		this.list.remove();
		this.ready = false;
	}

	setCategory(category: string): void {
		this.category = category;
		if (this.ready) this.applyFilter();
	}

	setOptions(options: Array<ComboboxOption>): void {
		this.allOptions = options;
		if (this.ready) this.applyFilter();
	}

	setSelectedFamily(family: string): void {
		this.selectedFamily = family;
		if (!this.ready) return;
		this.input.value = family;
		this.updateClearVisibility();
	}

	private applyFilter(): void {
		const query = this.input.value.toLowerCase().trim();
		this.filtered = this.allOptions
			.filter((option) => this.category === 'all' || option.category === this.category)
			.filter((option) => !query || option.family.toLowerCase().includes(query));
		this.activeIndex = -1;
		this.syncActiveDescendant();
		this.sizer.style.height = `${String(this.filtered.length * rowHeight)}px`;
		this.list.scrollTop = 0;
		this.renderWindow();
	}

	private clearSelection(): void {
		this.selectedFamily = '';
		this.input.value = '';
		this.closeDropdown();
		this.updateClearVisibility();
		this.dispatchEvent(new CustomEvent('clear'));
		this.input.blur();
	}

	private closeDropdown(): void {
		this.list.hidden = true;
		this.input.setAttribute('aria-expanded', 'false');
		this.input.removeAttribute('aria-activedescendant');
	}

	private ensureActiveVisible(): void {
		if (this.activeIndex < 0) return;
		const top = this.activeIndex * rowHeight;
		const bottom = top + rowHeight;
		if (top < this.list.scrollTop) {
			this.list.scrollTop = top;
		} else if (bottom > this.list.scrollTop + this.list.clientHeight) {
			this.list.scrollTop = bottom - this.list.clientHeight;
		}
	}

	private handleKey(event: KeyboardEvent): void {
		switch (event.key) {
			case 'ArrowDown': {
				event.preventDefault();
				this.activeIndex = Math.min(this.activeIndex + 1, this.filtered.length - 1);
				this.ensureActiveVisible();
				this.renderWindow();
				this.syncActiveDescendant();

				break;
			}

			case 'ArrowUp': {
				event.preventDefault();
				this.activeIndex = Math.max(this.activeIndex - 1, 0);
				this.ensureActiveVisible();
				this.renderWindow();
				this.syncActiveDescendant();

				break;
			}

			case 'Enter': {
				event.preventDefault();
				if (this.activeIndex >= 0) this.selectIndex(this.activeIndex);

				break;
			}

			case 'Escape': {
				event.preventDefault();
				this.closeDropdown();

				break;
			}
		}
	}

	private readonly onScroll = (): void => {
		if (this.rafId !== undefined) return;
		this.rafId = requestAnimationFrame(() => {
			this.rafId = undefined;
			this.renderWindow();
		});
	};

	private openDropdown(): void {
		this.list.hidden = false;
		this.input.setAttribute('aria-expanded', 'true');
		this.positionList();
		this.renderWindow();
		this.syncActiveDescendant();
	}

	private positionList(): void {
		const rect = this.input.getBoundingClientRect();
		const spaceBelow = globalThis.innerHeight - rect.bottom;
		const spaceAbove = rect.top;
		const isOpenDown = spaceBelow >= spaceAbove;
		const maxHeight = Math.max(minDropdownHeight, (isOpenDown ? spaceBelow : spaceAbove) - 12);
		const style = this.list.style;

		style.left = `${String(Math.round(rect.left))}px`;
		style.width = `${String(Math.round(rect.width))}px`;
		style.maxHeight = `${String(Math.round(maxHeight))}px`;
		if (isOpenDown) {
			style.top = `${String(Math.round(rect.bottom + 4))}px`;
			style.bottom = 'auto';
		} else {
			style.top = 'auto';
			style.bottom = `${String(Math.round(globalThis.innerHeight - rect.top + 4))}px`;
		}
	}

	private renderWindow(): void {
		const viewportHeight = this.list.clientHeight || minDropdownHeight;
		const start = Math.max(0, Math.floor(this.list.scrollTop / rowHeight) - bufferRows);
		const end = Math.min(
			this.filtered.length,
			start + Math.ceil(viewportHeight / rowHeight) + bufferRows * 2,
		);
		const fragment = document.createDocumentFragment();

		for (let index = start; index < end; index += 1) {
			const option = this.filtered[index];
			const template = rowTemplate.content.firstElementChild;
			if (!option || !template) continue;
			const row = template.cloneNode(true) as HTMLElement;
			const isActive = index === this.activeIndex;
			row.id = `fdt-option-${String(this.uid)}-${String(index)}`;
			row.dataset.index = String(index);
			row.style.top = `${String(index * rowHeight)}px`;
			row.classList.toggle('fdt-active', isActive);
			row.setAttribute('aria-selected', isActive ? 'true' : 'false');
			const familyLabel = row.querySelector<HTMLSpanElement>('.fdt-fam');
			if (familyLabel) familyLabel.textContent = option.family;
			if (!option.variable) row.querySelector('.fdt-var')?.remove();
			fragment.append(row);
		}

		this.sizer.replaceChildren(fragment);
	}

	private readonly reposition = (): void => {
		if (!this.list.hidden) this.positionList();
	};

	private selectIndex(index: number): void {
		const option = this.filtered[index];

		if (!option) return;

		this.selectedFamily = option.family;
		this.input.value = option.family;
		this.updateClearVisibility();
		this.closeDropdown();
		this.dispatchEvent(new CustomEvent<ComboboxOption>('change', { detail: option }));

		// Drop focus so the next click on the input re-opens the dropdown to pick another font
		this.input.blur();
	}

	private syncActiveDescendant(): void {
		if (this.activeIndex < 0) {
			this.input.removeAttribute('aria-activedescendant');

			return;
		}

		this.input.setAttribute(
			'aria-activedescendant',
			`fdt-option-${String(this.uid)}-${String(this.activeIndex)}`,
		);
	}

	private updateClearVisibility(): void {
		this.clearButton.hidden = this.input.value === '';
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'font-combobox': FontCombobox;
	}
}

if (!customElements.get('font-combobox')) {
	customElements.define('font-combobox', FontCombobox);
}
