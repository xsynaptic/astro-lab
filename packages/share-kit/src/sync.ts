import type { ShareKitActionKind, ShareKitDestination } from './destinations.js';
import type { ShareKitParts } from './render.js';
import type { ShareKitStrings } from './strings.js';

import { formatShareString, getDestinationHint, getDestinationLabel } from './strings.js';

const primaryLabels = {
	'copy-caption': 'primaryCopy',
	'open-composer': 'primaryOpen',
	'share-image': 'primaryShareImage',
	'share-link': 'primaryShareLink',
	'share-text': 'primaryShareText',
} as const satisfies Record<ShareKitActionKind, keyof ShareKitStrings<string>>;

interface SyncInput {
	destination: ShareKitDestination<string>;
	parts: ShareKitParts;
	strings: ShareKitStrings<string>;
}

interface SyncCaptionInput extends SyncInput {
	primaryAction: ShareKitActionKind;
}

export function syncCaptionView({ destination, parts, primaryAction, strings }: SyncCaptionInput) {
	const { limit } = destination;
	const count = destination.count(parts.caption.value);
	const isOver = limit !== undefined && count > limit;
	const label = getDestinationLabel(strings, destination);

	parts.count.textContent =
		limit === undefined ? String(count) : `${String(count)} / ${String(limit)}`;
	parts.count.toggleAttribute('data-share-kit-over', isOver);
	parts.caption.setAttribute('aria-invalid', String(isOver));
	parts.captionCopy.hidden = primaryAction === 'copy-caption';
	parts.primary.textContent = formatShareString(strings[primaryLabels[primaryAction]], {
		destination: label,
	});

	return {
		isOver,
		message: formatShareString(strings.captionOver, {
			count: String(count - (limit ?? 0)),
			destination: label,
		}),
	};
}

interface SyncDestinationInput extends SyncInput {
	assets: Array<HTMLElement>;
	suggested: HTMLElement | undefined;
}

export function syncDestinationView({
	assets,
	destination,
	parts,
	strings,
	suggested,
}: SyncDestinationInput) {
	for (const radio of parts.dialog.querySelectorAll<HTMLElement>('[role="radio"]')) {
		const isSelected = radio.dataset.shareKitDestination === destination.id;

		radio.setAttribute('aria-checked', String(isSelected));
		radio.tabIndex = isSelected ? 0 : -1;
	}

	parts.hint.textContent = getDestinationHint(strings, destination) ?? '';
	parts.hint.hidden = parts.hint.textContent === '';

	for (const asset of assets) {
		const badge = asset.querySelector<HTMLElement>('.share-kit-badge');

		if (badge) badge.hidden = asset !== suggested;
	}

	parts.grid.append(...parts.tiles);

	if (suggested) parts.grid.prepend(suggested);
}
