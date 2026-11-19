import type { ShareKitActionKind, ShareKitDestination } from './destinations.js';
import type { ShareKitParts } from './render.js';
import type { ShareKitStrings } from './strings.js';

import { getSharedRatio } from './formats.js';
import { formatShareString, getDestinationHint, getDestinationLabel } from './strings.js';

type ShareKitStringKey = keyof ShareKitStrings<string>;

const primaryLabels = {
	'open-composer': 'primaryOpen',
	'save-image': 'primarySaveImage',
	'share-image': 'primaryShareImage',
	'share-link': 'primaryShareLink',
	'share-text': 'primaryShareText',
} as const satisfies Record<Exclude<ShareKitActionKind, 'copy-caption'>, ShareKitStringKey>;

const copyLabels = {
	full: 'copyText',
	text: 'copyText',
	title: 'copyTitle',
	url: 'linkCopy',
} as const satisfies Record<ShareKitDestination<string>['shape'], ShareKitStringKey>;

interface SyncInput {
	destination: ShareKitDestination<string>;
	parts: ShareKitParts;
	strings: ShareKitStrings<string>;
}

interface SyncCaptionInput extends SyncInput {
	isEdited: boolean;
	numberFormat: Intl.NumberFormat;
	primaryAction: ShareKitActionKind;
}

export function syncCaptionView({
	destination,
	isEdited,
	numberFormat,
	parts,
	primaryAction,
	strings,
}: SyncCaptionInput) {
	const { limit } = destination;
	const count = destination.count(parts.caption.value);
	const isOver = limit !== undefined && count > limit;
	const label = getDestinationLabel(strings, destination);
	const over = numberFormat.format(count - (limit ?? 0));
	const copyLabel = strings[copyLabels[destination.shape]];

	const total =
		limit === undefined
			? numberFormat.format(count)
			: `${numberFormat.format(count)} / ${numberFormat.format(limit)}`;
	const overNote = isOver ? ` · ${formatShareString(strings.countOver, { count: over })}` : '';

	parts.count.textContent = `${total}${overNote}`;

	parts.count.toggleAttribute('data-share-kit-over', isOver);
	parts.caption.setAttribute('aria-invalid', String(isOver));
	parts.captionCopy.textContent = copyLabel;
	parts.captionCopy.hidden = primaryAction === 'copy-caption';
	parts.reset.inert = !isEdited;
	parts.primary.textContent =
		primaryAction === 'copy-caption'
			? copyLabel
			: formatShareString(strings[primaryLabels[primaryAction]], { destination: label });

	return {
		isOver,
		message: formatShareString(strings.captionOver, { count: over, destination: label }),
	};
}

interface SyncDestinationInput extends SyncInput {
	assets: Array<HTMLElement>;
	suggested: HTMLElement | undefined;
	url: string;
}

export function syncDestinationView({
	assets,
	destination,
	parts,
	strings,
	suggested,
	url,
}: SyncDestinationInput) {
	for (const radio of parts.dialog.querySelectorAll<HTMLElement>('[role="radio"]')) {
		const isSelected = radio.dataset.shareKitDestination === destination.id;

		radio.setAttribute('aria-checked', String(isSelected));
		radio.tabIndex = isSelected ? 0 : -1;
	}

	parts.hint.textContent = getDestinationHint(strings, destination) ?? '';
	parts.hint.hidden = parts.hint.textContent === '';
	parts.captionSection.hidden = destination.shape === 'url';
	parts.captionLabel.textContent =
		destination.shape === 'title' ? strings.fieldTitle : strings.fieldText;
	parts.caption.rows = destination.shape === 'title' ? 2 : 6;
	parts.link.textContent = url;
	parts.link.title = url;

	const ratio = getSharedRatio(assets.flatMap((tile) => parts.assets.get(tile) ?? []));

	parts.imagesSection.hidden = assets.length === 0;

	parts.grid.style.removeProperty('--_share-kit-preview-ratio');

	if (ratio) parts.grid.style.setProperty('--_share-kit-preview-ratio', ratio);

	for (const asset of assets) {
		const label = asset.querySelector<HTMLElement>('.share-kit-tile-label');
		const badge = asset.querySelector<HTMLElement>('.share-kit-badge');

		if (label) label.hidden = assets.length === 1;
		if (badge) badge.inert = asset !== suggested;
	}

	parts.grid.append(...parts.tiles);

	if (suggested) parts.grid.prepend(suggested);
}
