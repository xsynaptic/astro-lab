import { ProgressReadingElement, progressReadingElementName } from './element.js';

export function defineProgressReading() {
	if (customElements.get(progressReadingElementName)) return;

	customElements.define(progressReadingElementName, ProgressReadingElement);
}

export { ProgressReadingElement } from './element.js';
