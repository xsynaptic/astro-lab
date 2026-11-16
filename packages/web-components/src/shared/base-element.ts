export const BaseElement =
	typeof HTMLElement === 'undefined' ? (Object as unknown as typeof HTMLElement) : HTMLElement;
