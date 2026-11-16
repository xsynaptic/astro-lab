import type { ShareKitDestination, ShareKitDestinationIdOf } from './destinations.js';
import type { ShareKitIconsOption } from './icons.js';

import { ShareKitElement } from './element.js';
import { ShareIconSource, shareKitInterfaceIconNames } from './icons.js';

export type ShareKitDestinationList = readonly [
	ShareKitDestination<string>,
	...Array<ShareKitDestination<string>>,
];

export interface ShareKitOptions<Destinations extends ShareKitDestinationList> {
	destinations: Destinations;
	icons?: ShareKitIconsOption<ShareKitDestinationIdOf<Destinations>>;
}

const tagName = 'share-kit';

const reservedIds = new Set<string>(shareKitInterfaceIconNames);

function getCatalogue(destinations: ReadonlyArray<ShareKitDestination<string>>) {
	const catalogue = new Map<string, ShareKitDestination<string>>();

	for (const destination of destinations) {
		if (reservedIds.has(destination.id) || catalogue.has(destination.id)) {
			console.error(
				`share-kit: destination id "${destination.id}" is repeated or reserved for an icon, so <share-kit> is not defined`,
			);
			return;
		}

		catalogue.set(destination.id, destination);
	}

	return catalogue;
}

function warnMissingComposers(destinations: ReadonlyArray<ShareKitDestination<string>>) {
	for (const { actions, composer, id } of destinations) {
		const hasComposerAction = [...actions.desktop, ...actions.mobile].includes('open-composer');

		if (hasComposerAction && !composer) {
			console.warn(`share-kit: "${id}" lists open-composer but has no composer`);
		}
	}
}

function createElementClass(
	catalogue: ReadonlyMap<string, ShareKitDestination<string>>,
	iconSource: ShareIconSource,
) {
	return class extends ShareKitElement {
		protected override readonly catalogue = catalogue;
		protected override readonly iconSource = iconSource;
	};
}

// Logs rather than throws, since a throw here would stop every other script in the host's entry
// An element name registers once per page, so the first call's options stand
export function defineShareKit<const Destinations extends ShareKitDestinationList>({
	destinations,
	icons = {},
}: ShareKitOptions<Destinations>) {
	if (customElements.get(tagName)) {
		console.warn(
			'share-kit: <share-kit> is already defined, so this defineShareKit call is ignored',
		);
		return;
	}

	if (destinations.length === 0) {
		console.error('share-kit: no destinations registered, so <share-kit> is not defined');
		return;
	}

	const catalogue = getCatalogue(destinations);

	if (!catalogue) return;

	warnMissingComposers(destinations);
	customElements.define(tagName, createElementClass(catalogue, new ShareIconSource(icons)));
}
