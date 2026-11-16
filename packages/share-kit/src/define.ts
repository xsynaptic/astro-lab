import type { ShareKitIcons } from './icons.js';

import { ShareKitElement } from './element.js';

export interface ShareKitOptions {
	icons?: ShareKitIcons;
}

const tagName = 'share-kit';

// An element name registers once per page, so the first call's options stand
export function defineShareKit({ icons = {} }: ShareKitOptions = {}) {
	if (customElements.get(tagName)) return;

	customElements.define(
		tagName,
		class extends ShareKitElement {
			protected override readonly icons = icons;
		},
	);
}
