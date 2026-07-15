// Graphically pick a DOM element off the page
// Drives Astro's built-in `<astro-dev-toolbar-highlight>` as a cursor-following overlay
// Then resolves the element under the pointer on click
// `onPick` receives the element the toolbar turns it into a selector row
export interface ElementPicker {
	start(): void;
	stop(): void;
}

export function createElementPicker(onPick: (element: HTMLElement) => void): ElementPicker {
	let isActive = false;
	let highlight: HTMLElement | undefined;

	function ensureHighlight(): HTMLElement {
		if (!highlight) {
			highlight = document.createElement('astro-dev-toolbar-highlight');
			highlight.setAttribute('highlight-style', 'blue');

			// pointer-events must be off, or the z-index 2e9 box sits under the cursor and `elementFromPoint` returns the highlight instead of the page element beneath it
			highlight.style.pointerEvents = 'none';
			highlight.style.display = 'none';
			document.body.append(highlight);
		}

		return highlight;
	}

	function position(element: HTMLElement): void {
		const box = ensureHighlight();
		const rect = element.getBoundingClientRect();

		// Mirrors Astro's own positionHighlight: a 10px margin, sized in absolute document coordinates (the highlight is position:absolute, so add the scroll offset)
		box.style.display = 'block';
		box.style.top = `${String(Math.max(rect.top + globalThis.scrollY - 10, 0))}px`;
		box.style.left = `${String(Math.max(rect.left + globalThis.scrollX - 10, 0))}px`;
		box.style.width = `${String(rect.width + 15)}px`;
		box.style.height = `${String(rect.height + 15)}px`;
	}

	function targetFrom(event: MouseEvent | PointerEvent): HTMLElement | undefined {
		const found = document.elementFromPoint(event.clientX, event.clientY);
		if (!(found instanceof HTMLElement)) return undefined;

		// Ignore the dev toolbar itself (its shadow host retargets to this tag).
		if (found.closest('astro-dev-toolbar')) return undefined;

		return found;
	}

	function onMove(event: PointerEvent): void {
		const element = targetFrom(event);
		if (!element) {
			if (highlight) highlight.style.display = 'none';

			return;
		}

		position(element);
	}

	function onClick(event: MouseEvent): void {
		const element = targetFrom(event);
		if (!element) return;

		// Swallow the click so picking never navigates a link or closes the toolbar window
		event.preventDefault();
		event.stopPropagation();

		stop();
		onPick(element);
	}

	function onKey(event: KeyboardEvent): void {
		if (event.key === 'Escape') stop();
	}

	function start(): void {
		if (isActive) return;
		isActive = true;
		ensureHighlight();
		document.body.style.cursor = 'crosshair';
		document.addEventListener('pointermove', onMove, { capture: true });
		document.addEventListener('click', onClick, { capture: true });
		document.addEventListener('keydown', onKey, { capture: true });
	}

	function stop(): void {
		isActive = false;
		document.body.style.removeProperty('cursor');
		document.removeEventListener('pointermove', onMove, { capture: true });
		document.removeEventListener('click', onClick, { capture: true });
		document.removeEventListener('keydown', onKey, { capture: true });
		if (highlight) highlight.style.display = 'none';
	}

	return { start, stop };
}
