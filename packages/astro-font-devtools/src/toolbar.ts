import { defineToolbarApp } from 'astro/toolbar';

import type { ComboboxOption } from './client/combobox.js';
import type { FontTargetRow, ResolveRequest } from './client/target-row.js';
import type { CatalogFont } from './shared/types.js';

import './client/combobox.js';
import './client/script-select.js';
import './client/target-row.js';
import { html } from './client/dom-tags.js';
import { createElementPicker } from './client/element-picker.js';
import { filterFonts } from './client/filter.js';
import { sortedScripts } from './client/scripts.js';
import {
	addedTargets,
	getSelection,
	removeSelection,
	setSelection,
	syncAdded,
} from './client/session-store.js';
import { toolbarStyles } from './client/toolbar-styles.js';

const appId = 'astro-font-devtools';
const catalogUrl = '/__astro-font-devtools/catalog';
const resolveUrl = '/__astro-font-devtools/resolve';

let activePicker: ReturnType<typeof createElementPicker> | undefined;
let catalog: Array<CatalogFont> | undefined;
let catalogPromise: Promise<Array<CatalogFont>> | undefined;
let toolbarStyleSheet: CSSStyleSheet | undefined;

function applyWindowPlacement(canvas: ShadowRoot, placement: string | undefined): void {
	if (!placement) return;
	canvas.querySelector('astro-dev-toolbar-window')?.setAttribute('placement', placement);
}

// A readable, broad selector for a picked element (class first so it matches siblings).
function defaultSelector(element: HTMLElement): string {
	const tag = element.tagName.toLowerCase();
	const className = element.classList[0];
	if (className) return `${tag}.${className}`;
	if (element.id) return `${tag}#${element.id}`;

	return tag;
}

async function fetchCatalog(): Promise<Array<CatalogFont>> {
	try {
		const response = await fetch(catalogUrl);
		if (!response.ok) throw new Error(`catalog request failed (${String(response.status)})`);
		const data: unknown = await response.json();
		if (!Array.isArray(data)) throw new Error('catalog response was not a list');
		const fonts = data as Array<CatalogFont>;
		catalog = fonts;

		return fonts;
	} finally {
		// Clear so a failed fetch isn't cached and the next open retries
		catalogPromise = undefined;
	}
}

function findFont(family: string): CatalogFont | undefined {
	return catalog?.find((font) => font.family === family);
}

// No public API exposes the toolbar's placement on load (only the change event fires later)
// So read it off Astro's own toolbar root to anchor our window on the correct side the first time
function getToolbarPlacement(): string | undefined {
	const toolbar = document.querySelector('astro-dev-toolbar');
	if (!toolbar?.shadowRoot) return undefined;
	const root = toolbar.shadowRoot.querySelector<HTMLElement>('#dev-toolbar-root');

	return root?.dataset.placement;
}

function getToolbarStyleSheet(): CSSStyleSheet {
	if (toolbarStyleSheet) return toolbarStyleSheet;
	toolbarStyleSheet = new CSSStyleSheet();
	toolbarStyleSheet.replaceSync(toolbarStyles);

	return toolbarStyleSheet;
}

function loadCatalog(): Promise<Array<CatalogFont>> {
	if (catalog) return Promise.resolve(catalog);
	catalogPromise ??= fetchCatalog();

	return catalogPromise;
}

function render(canvas: ShadowRoot, configTargets: Array<string>): void {
	activePicker?.stop();
	// Clear styles injected by the previous render; rows re-inject what they restore.
	for (const style of document.head.querySelectorAll('style[data-font-devtools]')) style.remove();

	canvas.innerHTML = html`
		<astro-dev-toolbar-window>
			<div class="fdt-panel">
				<div id="fdt-rows"></div>
				<div class="fdt-foot">
					<astro-dev-toolbar-button id="fdt-pick" button-style="purple" size="small"
						>Pick Element</astro-dev-toolbar-button
					>
					<astro-dev-toolbar-button id="fdt-add" button-style="purple" size="small"
						>Add Target</astro-dev-toolbar-button
					>
					<span id="fdt-status" class="fdt-status">Loading fonts...</span>
					<font-script-select id="fdt-scripts" class="fdt-scripts" hidden></font-script-select>
					<div id="fdt-providers" class="fdt-providers" hidden></div>
				</div>
			</div>
		</astro-dev-toolbar-window>
	`;
	canvas.adoptedStyleSheets = [getToolbarStyleSheet()];

	// The dev-toolbar window hard-codes 24px padding on its :host; an inline style reclaims space.
	canvas
		.querySelector<HTMLElement>('astro-dev-toolbar-window')
		?.style.setProperty('padding', '0.5rem 0.75rem');

	const rows = canvas.querySelector('#fdt-rows');
	const status = canvas.querySelector('#fdt-status');
	const pickButton = canvas.querySelector('#fdt-pick');
	const newTargetButton = canvas.querySelector('#fdt-add');
	if (!rows || !status || !pickButton || !newTargetButton) return;
	const providersEl = canvas.querySelector<HTMLElement>('#fdt-providers');
	const scriptSelect = canvas.querySelector('font-script-select');

	const active = new Set<string>();
	// Start unfiltered: the whole catalog shows on load, and picking a script narrows from there.
	const activeScripts = new Set<string>();
	const providerFor = (font: CatalogFont): string | undefined =>
		font.providers.find((provider) => active.has(provider));

	const rowHandles: Array<FontTargetRow> = [];
	let currentOptions: Array<ComboboxOption> = [];

	const sharedDeps = {
		findFont,
		getSelection,
		providerFor,
		removeSelection,
		resolveCss,
		setSelection,
		syncAdded,
	};

	// Arrow (not a hoisted declaration) so the non-null narrowing of `rows` above carries in.
	const addRow = (target: string, isAdded: boolean): FontTargetRow => {
		const row = document.createElement('font-target-row');
		row.configure({ ...sharedDeps, initialTarget: target, isAdded });
		rows.append(row);
		rowHandles.push(row);

		return row;
	};

	const initialTargets = [...new Set([...configTargets, ...addedTargets()])];
	for (const target of initialTargets) {
		addRow(target, !configTargets.includes(target));
	}

	newTargetButton.addEventListener('click', () => {
		const handle = addRow('', true);
		handle.setOptions(currentOptions);
		handle.scrollIntoView({ block: 'nearest' });
		handle.focusTarget();
	});

	const picker = createElementPicker((element) => {
		const handle = addRow(defaultSelector(element), true);
		handle.setOptions(currentOptions);
		handle.scrollIntoView({ block: 'nearest' });
	});
	activePicker = picker;
	setDisabled(pickButton, true);
	setDisabled(newTargetButton, true);
	pickButton.addEventListener('click', () => {
		picker.start();
	});

	rows.classList.add('fdt-rows-locked');

	void loadCatalog()
		.then((fonts) => {
			status.remove();
			rows.classList.remove('fdt-rows-locked');
			const allProviders = fonts.flatMap((font) => font.providers);
			for (const provider of allProviders) active.add(provider);
			const computeOptions = (): Array<ComboboxOption> =>
				filterFonts(fonts, active, activeScripts).map((font) => ({
					category: font.category,
					family: font.family,
					variable: font.variable,
				}));

			function refreshOptions(): void {
				currentOptions = computeOptions();
				for (const handle of rowHandles) {
					handle.setOptions(currentOptions);
				}
			}

			currentOptions = computeOptions();
			for (const handle of rowHandles) {
				handle.setOptions(currentOptions);
				handle.restore();
			}

			setDisabled(pickButton, false);
			setDisabled(newTargetButton, false);

			const available = [...active].toSorted((first, second) => first.localeCompare(second));
			if (providersEl && available.length > 1) {
				renderProviderToggles(providersEl, available, active, refreshOptions);
			}

			const scriptVocab = sortedScripts(fonts);
			if (scriptSelect && scriptVocab.length > 1) {
				scriptSelect.hidden = false;
				scriptSelect.setAvailable(scriptVocab);
				scriptSelect.setSelected([...activeScripts]);
				scriptSelect.addEventListener('change', (event) => {
					const { selected } = (event as CustomEvent<{ selected: Array<string> }>).detail;
					activeScripts.clear();
					for (const script of selected) activeScripts.add(script);
					refreshOptions();
				});
			}
		})
		.catch(() => {
			status.classList.add('fdt-error');
			status.innerHTML = html`
				Error loading font data
				<astro-dev-toolbar-button button-style="gray" size="small">Retry</astro-dev-toolbar-button>
			`;
			status.querySelector('astro-dev-toolbar-button')?.addEventListener('click', () => {
				render(canvas, configTargets);
			});
		});
}

// Global provider filter row: one tiny toggle per available provider
// Toggling mutates the shared `active` set and recomputes the combined catalog. Keeps at least one provider on
function renderProviderToggles(
	container: HTMLElement,
	providers: Array<string>,
	active: Set<string>,
	onChange: () => void,
): void {
	container.innerHTML = html`<span class="fdt-providers-label">Providers</span>${providers
			.map(
				(provider) =>
					`<astro-dev-toolbar-button data-provider="${provider}" button-style="gray" size="small">${provider}</astro-dev-toolbar-button>`,
			)
			.join('')}`;
	container.hidden = false;
	for (const provider of providers) {
		const button = container.querySelector<HTMLElement>(
			`[data-provider="${CSS.escape(provider)}"]`,
		);
		if (!button) continue;
		button.addEventListener('click', () => {
			const isActive = active.has(provider);
			if (isActive && active.size === 1) return; // Never leave the catalog empty
			if (isActive) {
				active.delete(provider);
				button.setAttribute('button-style', 'ghost');
			} else {
				active.add(provider);
				button.setAttribute('button-style', 'gray');
			}

			onChange();
		});
	}
}

async function resolveCss({
	family,
	provider,
	styles,
	subsets,
	weights,
}: ResolveRequest): Promise<string> {
	const params = new URLSearchParams({
		family,
		styles: styles.join(','),
		weights: weights.join(','),
	});
	if (provider) params.set('provider', provider);
	if (subsets.length > 0) params.set('subsets', subsets.join(','));

	const response = await fetch(`${resolveUrl}?${params.toString()}`);

	return response.text();
}

function setDisabled(button: Element, isDisabled: boolean): void {
	button.classList.toggle('fdt-disabled', isDisabled);
}

export default defineToolbarApp({
	beforeTogglingOff() {
		activePicker?.stop();

		return true;
	},
	init(canvas, app, server) {
		let configuredTargets: Array<string> | undefined;

		function setup(targets: Array<string>): void {
			render(canvas, targets);
			applyWindowPlacement(canvas, getToolbarPlacement());
		}

		server.on<{ targets?: Array<string> }>(`${appId}:config`, ({ targets = [] }) => {
			configuredTargets = targets;
			setup(targets);
		});
		app.onToolbarPlacementUpdated(({ placement }) => {
			applyWindowPlacement(canvas, placement);
		});

		document.addEventListener('astro:after-swap', () => {
			if (configuredTargets) setup(configuredTargets);
		});
	},
});
