export function setProgress(element: HTMLElement, value: number) {
	element.style.setProperty('--progress', String(value));
}

export function setProgressActive(element: HTMLElement, isActive: boolean) {
	element.toggleAttribute('data-active', isActive);
}
