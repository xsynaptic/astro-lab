import type { ShareKitDestinationId, SharePrimaryAction } from './destinations.js';
import type { ShareKitParts } from './render.js';
import type { ShareKitStrings } from './strings.js';

import { countCaption } from './caption.js';
import { getShareDestination } from './destinations.js';
import { formatShareString, isShareStringKey } from './strings.js';

const primaryLabels = {
	'copy-caption': 'primaryCopy',
	'open-composer': 'primaryOpen',
	'share-image': 'primaryShareImage',
	'share-link': 'primaryShareLink',
	'share-text': 'primaryShareText',
} as const satisfies Record<SharePrimaryAction, keyof ShareKitStrings>;

export function getSuggestedAsset(assets: Array<HTMLElement>, destination: ShareKitDestinationId) {
	const { assetRole } = getShareDestination(destination);

	return (
		assets.find((asset) => asset.dataset.shareKitRole === assetRole) ??
		assets.find((asset) => asset.dataset.shareKitRole === 'landscape') ??
		assets[0]
	);
}

interface SyncInput {
	destination: ShareKitDestinationId;
	parts: ShareKitParts;
	strings: ShareKitStrings;
}

interface SyncCaptionInput extends SyncInput {
	primaryAction: SharePrimaryAction;
}

export function syncCaptionView({ destination, parts, primaryAction, strings }: SyncCaptionInput) {
	const { limit } = getShareDestination(destination);
	const count = countCaption(parts.caption.value, destination);
	const isOver = limit !== undefined && count > limit;
	const label = strings[`destination.${destination}`];

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
		const isSelected = radio.dataset.shareKitDestination === destination;

		radio.setAttribute('aria-checked', String(isSelected));
		radio.tabIndex = isSelected ? 0 : -1;
	}

	const hintKey = `hint.${destination}`;

	parts.hint.textContent = isShareStringKey(hintKey) ? strings[hintKey] : '';
	parts.hint.hidden = parts.hint.textContent === '';

	for (const asset of assets) {
		const badge = asset.querySelector<HTMLElement>('.share-kit-badge');

		if (badge) badge.hidden = asset !== suggested;
	}

	parts.grid.append(...parts.tiles);

	if (suggested) parts.grid.prepend(suggested);
}
