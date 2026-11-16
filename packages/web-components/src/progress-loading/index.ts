import { ProgressLoadingElement, progressLoadingElementName } from './element.js';

export function defineProgressLoading() {
	if (customElements.get(progressLoadingElementName)) return;

	customElements.define(progressLoadingElementName, ProgressLoadingElement);
}

export { ProgressLoadingElement } from './element.js';
