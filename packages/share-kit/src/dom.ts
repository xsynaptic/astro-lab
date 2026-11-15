type Child = Node | string | undefined;

type Attributes = Record<string, string | undefined>;

export function createElement<Tag extends keyof HTMLElementTagNameMap>(
	tag: Tag,
	attributes: Attributes = {},
	children: Array<Child> = [],
) {
	const element = document.createElement(tag);

	for (const [name, value] of Object.entries(attributes)) {
		if (value !== undefined) element.setAttribute(name, value);
	}

	element.append(...children.filter((child) => child !== undefined));

	return element;
}

export function joinClasses(...classes: Array<string | undefined>) {
	return classes.filter(Boolean).join(' ');
}

const svgNamespace = 'http://www.w3.org/2000/svg';

export function createIcon(path: string, size: number) {
	const svg = document.createElementNS(svgNamespace, 'svg');
	const shape = document.createElementNS(svgNamespace, 'path');

	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('height', String(size));
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('width', String(size));
	shape.setAttribute('d', path);
	shape.setAttribute('fill', 'currentColor');
	svg.append(shape);

	return svg;
}

function isOnBackdrop(dialog: HTMLDialogElement, event: PointerEvent) {
	if (event.target !== dialog) return false;

	const rect = dialog.getBoundingClientRect();

	return (
		event.clientX < rect.left ||
		event.clientX > rect.right ||
		event.clientY < rect.top ||
		event.clientY > rect.bottom
	);
}

// Checking both ends of the press means a drag that ends past the edge won't close the dialog
export function polyfillLightDismiss(dialog: HTMLDialogElement, signal: AbortSignal) {
	if ('closedBy' in HTMLDialogElement.prototype) return;

	let isBackdropPress = false;

	dialog.addEventListener(
		'pointerdown',
		(event) => {
			isBackdropPress = isOnBackdrop(dialog, event);
		},
		{ signal },
	);
	dialog.addEventListener(
		'pointerup',
		(event) => {
			if (isBackdropPress && isOnBackdrop(dialog, event)) dialog.close();

			isBackdropPress = false;
		},
		{ signal },
	);
}

export const radioKeys: Partial<Record<string, (index: number, count: number) => number>> = {
	ArrowDown: (index, count) => (index + 1) % count,
	ArrowLeft: (index, count) => (index - 1 + count) % count,
	ArrowRight: (index, count) => (index + 1) % count,
	ArrowUp: (index, count) => (index - 1 + count) % count,
	End: (_index, count) => count - 1,
	Home: () => 0,
};
