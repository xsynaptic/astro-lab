import { TopButtonElement, topButtonElementName } from './element.js';

export function defineTopButton() {
	if (customElements.get(topButtonElementName)) return;

	customElements.define(topButtonElementName, TopButtonElement);
}

export type { TopButtonActivateDetail } from './element.js';
export { topButtonActivateEvent, TopButtonElement } from './element.js';
