import type { CatalogFont } from '../shared/types.js';
import type { ComboboxOption } from './combobox.js';
import type { Selection } from './session-store.js';

import { icons } from '../shared/icons.js';
import { fontCategories } from '../shared/types.js';
import { html } from './dom-tags.js';

export interface ResolveRequest {
	family: string;
	provider: string | undefined;
	styles: Array<string>;
	subsets: Array<string>;
	weights: Array<string>;
}

export interface TargetRowOptions {
	findFont: (family: string) => CatalogFont | undefined;
	getSelection: (target: string) => Selection | undefined;
	initialTarget: string;
	isAdded: boolean;
	providerFor: (font: CatalogFont) => string | undefined;
	removeSelection: (target: string) => void;
	resolveCss: (request: ResolveRequest) => Promise<string>;
	setSelection: (target: string, selection: Selection) => void;
	syncAdded: (oldTarget: string, newTarget: string) => void;
}

const categories = ['all', ...fontCategories];
const genericFamilies = new Set([
	'cursive',
	'fantasy',
	'monospace',
	'sans-serif',
	'serif',
	'system-ui',
	'ui-monospace',
	'ui-rounded',
	'ui-sans-serif',
	'ui-serif',
]);

let rowCounter = 0;

export class FontTargetRow extends HTMLElement {
	private appliedTarget: string | undefined;
	private combobox!: HTMLElementTagNameMap['font-combobox'];
	private controller: AbortController | undefined;
	private faceCss = '';
	private italicButton!: HTMLButtonElement;
	private options!: TargetRowOptions;
	private pendingFocus = false;
	private pendingOptions: Array<ComboboxOption> | undefined;
	private pendingRestore = false;
	private rowId = '';
	private selectedFont: CatalogFont | undefined;
	private target = '';
	private targetInput!: HTMLInputElement;
	private weightSelect!: HTMLSelectElement;
	private wired = false;

	configure(options: TargetRowOptions): void {
		this.options = options;
		this.target = options.initialTarget;
	}

	connectedCallback(): void {
		if (this.wired) return;

		rowCounter += 1;
		this.rowId = `fdt-${String(rowCounter)}`;
		this.innerHTML = html`
			<div class="fdt-rmain">
				<input
					class="fdt-target"
					spellcheck="false"
					autocomplete="off"
					placeholder="--font-var or .selector"
					aria-label="Target: CSS variable or selector"
				/>
				<select
					class="fdt-category"
					id="fdt-category-${this.rowId}"
					aria-label="Filter by category"
				>
					${categories
						.map((category) => `<option value="${category}">${category}</option>`)
						.join('')}
				</select>
				<font-combobox></font-combobox>
				<select data-control="weight" class="fdt-select" aria-label="Font weight" disabled></select>
				<button
					data-control="italic"
					class="fdt-iconbtn fdt-italic"
					type="button"
					aria-pressed="false"
					aria-label="Toggle italic"
					disabled
				>
					${icons.italic}
				</button>
				<button data-action="delete" class="fdt-iconbtn" type="button" aria-label="Remove this row">
					${icons.close}
				</button>
			</div>
		`;

		const targetInput = this.querySelector<HTMLInputElement>('.fdt-target');
		const dismissButton = this.querySelector<HTMLButtonElement>('[data-action="delete"]');
		const categorySelect = this.querySelector<HTMLSelectElement>('.fdt-category');
		const combobox = this.querySelector('font-combobox');
		const weightSelect = this.querySelector<HTMLSelectElement>('[data-control="weight"]');
		const italicButton = this.querySelector<HTMLButtonElement>('[data-control="italic"]');
		if (
			!targetInput ||
			!dismissButton ||
			!categorySelect ||
			!combobox ||
			!weightSelect ||
			!italicButton
		) {
			throw new Error('astro-font-devtools: row template is missing its controls');
		}

		this.targetInput = targetInput;
		this.combobox = combobox;
		this.weightSelect = weightSelect;
		this.italicButton = italicButton;

		this.controller = new AbortController();
		const { signal } = this.controller;
		const { isAdded, syncAdded } = this.options;

		targetInput.value = this.target;
		if (isAdded && this.target) syncAdded('', this.target);

		targetInput.addEventListener(
			'input',
			() => {
				const next = targetInput.value.trim();
				if (next === this.target) return;
				if (isAdded) syncAdded(this.target, next);
				if (this.target) this.options.removeSelection(this.target);
				this.clearApplication();
				this.target = next;
				this.applyNow();
				this.syncControlAvailability();
				this.persist();
			},
			{ signal },
		);

		categorySelect.addEventListener(
			'change',
			() => {
				this.combobox.setSelectedFamily('');
				this.combobox.setCategory(categorySelect.value);
				this.selectedFont = undefined;
				this.freezeControls();
			},
			{ signal },
		);

		combobox.addEventListener(
			'change',
			(event) => {
				void this.chooseFont((event as CustomEvent<ComboboxOption>).detail.family);
			},
			{ signal },
		);
		combobox.addEventListener(
			'clear',
			() => {
				this.clearApplication();
				if (this.target) this.options.removeSelection(this.target);
				this.selectedFont = undefined;
				this.faceCss = '';
				this.freezeControls();
			},
			{ signal },
		);

		weightSelect.addEventListener(
			'change',
			() => {
				this.applyNow();
				this.persist();
			},
			{ signal },
		);
		italicButton.addEventListener(
			'click',
			() => {
				if (italicButton.disabled) return;
				this.setItalic(!this.isItalic());
				this.applyNow();
				this.persist();
			},
			{ signal },
		);

		dismissButton.addEventListener(
			'click',
			() => {
				if (isAdded) syncAdded(this.target, '');
				if (this.target) this.options.removeSelection(this.target);
				this.remove(); // disconnectedCallback clears the applied styles
			},
			{ signal },
		);

		this.wired = true;
		if (this.pendingOptions) this.combobox.setOptions(this.pendingOptions);
		if (this.pendingRestore) {
			this.pendingRestore = false;
			this.restore();
		}

		if (this.pendingFocus) {
			this.pendingFocus = false;
			this.targetInput.focus();
		}
	}

	disconnectedCallback(): void {
		this.controller?.abort();
		this.clearApplication();
		this.wired = false;
	}

	focusTarget(): void {
		if (!this.wired) {
			this.pendingFocus = true;

			return;
		}

		this.targetInput.focus();
	}

	restore(): void {
		if (!this.wired) {
			this.pendingRestore = true;

			return;
		}

		if (!this.target) return;
		const saved = this.options.getSelection(this.target);
		if (!saved) return;
		this.combobox.setSelectedFamily(saved.family);
		const font = this.options.findFont(saved.family);
		if (!font) return;
		this.populatePanel(font);
		if (saved.weight !== undefined) this.weightSelect.value = String(saved.weight);
		this.setItalic(saved.italic ?? false);
		void this.options
			.resolveCss({
				family: saved.family,
				provider: this.options.providerFor(font),
				styles: ['normal', 'italic'],
				subsets: font.scripts,
				weights: font.weights.map(String),
			})
			.then((css) => {
				this.faceCss = css;
				this.applyNow();
			});
	}

	setOptions(options: Array<ComboboxOption>): void {
		this.pendingOptions = options;
		if (this.wired) this.combobox.setOptions(options);
	}

	// Reuses the already-resolved faces; no refetch.
	private applyNow(): void {
		this.clearApplication();
		if (!this.selectedFont || !this.faceCss || !this.target) return;
		const family = this.selectedFont.family;
		if (isVarTarget(this.target)) {
			const fallback = extractFallback(
				getComputedStyle(document.documentElement).getPropertyValue(this.target).trim(),
			);
			injectFontStyle(this.rowId, this.faceCss);
			document.documentElement.style.setProperty(this.target, `"${family}", ${fallback}`);
		} else {
			const refEl = this.refElement();
			const fallback = refEl ? getComputedStyle(refEl).fontFamily || 'sans-serif' : 'sans-serif';
			const decls = [`font-family: "${family}", ${fallback} !important`];
			if (this.weightSelect.value) decls.push(`font-weight: ${this.weightSelect.value} !important`);
			if (this.isItalic()) decls.push('font-style: italic !important');
			injectFontStyle(this.rowId, `${this.faceCss}\n${this.target} { ${decls.join('; ')}; }`);
		}

		this.appliedTarget = this.target;
	}

	private async chooseFont(family: string): Promise<void> {
		const font = this.options.findFont(family);
		if (!font) return;
		this.populatePanel(font);
		this.faceCss = await this.options.resolveCss({
			family,
			provider: this.options.providerFor(font),
			styles: ['normal', 'italic'],
			subsets: font.scripts,
			weights: font.weights.map(String),
		});
		this.applyNow();
		this.persist();
	}

	private clearApplication(): void {
		if (this.appliedTarget && isVarTarget(this.appliedTarget)) {
			document.documentElement.style.removeProperty(this.appliedTarget);
		}

		document.head.querySelector(`style[data-font-devtools="${CSS.escape(this.rowId)}"]`)?.remove();
		this.appliedTarget = undefined;
	}

	private freezeControls(): void {
		this.weightSelect.replaceChildren();
		this.weightSelect.disabled = true;
		this.italicButton.disabled = true;
		this.setItalic(false);
	}

	private isItalic(): boolean {
		return this.italicButton.getAttribute('aria-pressed') === 'true';
	}

	private persist(): void {
		if (!this.target || !this.selectedFont) return;
		const selection: Selection = { family: this.selectedFont.family };
		const weight = Number(this.weightSelect.value);
		if (!Number.isNaN(weight)) selection.weight = weight;
		if (this.isItalic()) selection.italic = true;
		this.options.setSelection(this.target, selection);
	}

	private pickDefaultWeight(font: CatalogFont): number {
		const refEl = this.refElement();
		const wanted = refEl ? Number(getComputedStyle(refEl).fontWeight) || 400 : 400;
		if (font.weights.includes(wanted)) return wanted;
		if (font.weights.includes(400)) return 400;

		return font.weights[0] ?? 400;
	}

	private populatePanel(font: CatalogFont): void {
		this.selectedFont = font;
		const refEl = this.refElement();
		this.weightSelect.innerHTML = font.weights
			.map((weight) => `<option value="${String(weight)}">${String(weight)}</option>`)
			.join('');
		this.weightSelect.value = String(this.pickDefaultWeight(font));
		this.setItalic(!!refEl && /^(?:italic|oblique)/.test(getComputedStyle(refEl).fontStyle));
		this.syncControlAvailability();
	}

	// First element a selector currently matches (for fallback font + weight/italic defaults).
	private refElement(): Element | undefined {
		if (!this.target || isVarTarget(this.target)) return undefined;
		try {
			return document.querySelector(this.target) ?? undefined;
		} catch {
			return undefined;
		}
	}

	private setItalic(isItalic: boolean): void {
		this.italicButton.setAttribute('aria-pressed', isItalic ? 'true' : 'false');
	}

	// Weight/italic can't affect a CSS variable (it only carries the family, and we don't control
	// where it's used), so they stay frozen for --var targets; only selector rows apply them.
	private syncControlAvailability(): void {
		if (!this.selectedFont) return;
		const isVariable = isVarTarget(this.target);
		this.weightSelect.disabled = isVariable || this.selectedFont.weights.length === 0;
		this.italicButton.disabled = isVariable || !this.selectedFont.italic;
		if (this.italicButton.disabled) this.setItalic(false);
	}
}

function extractFallback(currentValue: string): string {
	const tokens = currentValue
		.split(',')
		.map((token) => token.trim().replaceAll(/^['"]|['"]$/g, ''));
	for (let index = tokens.length - 1; index >= 0; index -= 1) {
		const token = tokens[index];
		if (token && genericFamilies.has(token)) return token;
	}

	return 'sans-serif';
}

function injectFontStyle(key: string, css: string): void {
	document.head.querySelector(`style[data-font-devtools="${CSS.escape(key)}"]`)?.remove();
	const style = document.createElement('style');
	style.dataset.fontDevtools = key;
	style.textContent = css;
	document.head.append(style);
}

function isVarTarget(target: string): boolean {
	return target.startsWith('--');
}

declare global {
	interface HTMLElementTagNameMap {
		'font-target-row': FontTargetRow;
	}
}

if (!customElements.get('font-target-row')) {
	customElements.define('font-target-row', FontTargetRow);
}
