import type { ShareCapability } from './actions.js';
import type { ShareKitDestination } from './destinations.js';
import type { ShareKitIcons } from './icons.js';
import type { ShareKitStrings } from './strings.js';
import type { ShareKitAsset, ShareKitPayload } from './types.js';

import { createElement, createIconSlot } from './dom.js';
import { getDestinationLabel } from './strings.js';

interface RenderInput {
	capabilities: ReadonlySet<ShareCapability>;
	destinations: ReadonlyArray<ShareKitDestination<string>>;
	icons: ShareKitIcons<string>;
	id: string;
	isIconsLoading: boolean;
	payload: ShareKitPayload<string>;
	strings: ShareKitStrings<string>;
}

// No slot for an icon that will never come
function renderDestinationIcon({ icons, isIconsLoading }: RenderInput, name: string) {
	const path = icons[name];

	return path || isIconsLoading ? createIconSlot(name, path) : undefined;
}

interface ActionInput {
	action: string;
	describedBy?: string;
	label: string;
}

function renderAction({ action, describedBy, label }: ActionInput) {
	return createElement(
		'button',
		{
			'aria-describedby': describedBy,
			class: 'share-kit-action',
			'data-share-kit-action': action,
			type: 'button',
		},
		[label],
	);
}

function renderHeading(children: Array<Node | string>, id?: string) {
	return createElement('h3', { class: 'share-kit-heading', id }, children);
}

interface IconButtonInput {
	action: string;
	fallback: string;
	icon: string;
	label: string;
}

function renderIconButton(
	{ icons }: RenderInput,
	{ action, fallback, icon, label }: IconButtonInput,
) {
	return createElement(
		'button',
		{
			'aria-label': label,
			class: 'share-kit-icon-button',
			'data-share-kit-action': action,
			title: label,
			type: 'button',
		},
		[createIconSlot(icon, icons[icon], fallback)],
	);
}

function renderHeader(context: RenderInput) {
	const { id, strings } = context;
	const heading = createElement('h2', { class: 'share-kit-title', id: `${id}-title` }, [
		strings.title,
	]);
	const close = renderIconButton(context, {
		action: 'close',
		fallback: '×',
		icon: 'close',
		label: strings.close,
	});

	return {
		header: createElement('header', { class: 'share-kit-header' }, [heading, close]),
		heading,
	};
}

function renderDestination(context: RenderInput, destination: ShareKitDestination<string>) {
	const { strings } = context;

	return createElement(
		'button',
		{
			'aria-checked': 'false',
			class: 'share-kit-destination',
			'data-share-kit-action': 'destination',
			'data-share-kit-destination': destination.id,
			role: 'radio',
			tabindex: '-1',
			type: 'button',
		},
		[
			renderDestinationIcon(context, destination.id),
			createElement('span', {}, [getDestinationLabel(strings, destination)]),
		],
	);
}

function renderDestinationRow(context: RenderInput) {
	const { destinations, id, strings } = context;
	const headingId = `${id}-destinations`;
	const group = createElement(
		'div',
		{ 'aria-labelledby': headingId, class: 'share-kit-destinations', role: 'radiogroup' },
		destinations.map((destination) => renderDestination(context, destination)),
	);

	return [
		renderHeading([strings.destinationsTitle], headingId),
		createElement('div', { class: 'share-kit-destinations-row' }, [group]),
	];
}

function renderDestinations(context: RenderInput) {
	const hint = createElement('p', { class: 'share-kit-hint', id: `${context.id}-hint` });

	if (context.destinations.length === 1) return { hint, section: hint };

	return {
		hint,
		section: createElement('section', { class: 'share-kit-section' }, [
			...renderDestinationRow(context),
			hint,
		]),
	};
}

function renderCaption(context: RenderInput) {
	const { id, payload, strings } = context;
	const captionId = `${id}-caption`;
	const countId = `${id}-count`;
	const caption = createElement('textarea', {
		'aria-describedby': `${countId} ${id}-hint`,
		class: 'share-kit-caption',
		dir: 'auto',
		id: captionId,
		lang: payload.locale,
	});
	const count = createElement('span', { class: 'share-kit-count', id: countId });
	const captionCopy = renderAction({ action: 'copy-caption', label: '' });
	const reset = renderAction({ action: 'reset', label: strings.captionReset });
	const label = createElement('label', { for: captionId });
	const alert = createElement('p', { class: 'share-kit-visually-hidden', role: 'status' });

	reset.inert = true;

	return {
		alert,
		caption,
		captionCopy,
		captionLabel: label,
		count,
		reset,
		section: createElement('section', { class: 'share-kit-section' }, [
			renderHeading([label]),
			caption,
			createElement('div', { class: 'share-kit-caption-meta' }, [
				count,
				createElement('span', { class: 'share-kit-actions' }, [reset, captionCopy]),
			]),
			alert,
		]),
	};
}

interface TileInput {
	actions: Array<[action: string, label: string]>;
	asset: ShareKitAsset;
	index: number;
}

// A host's image id may hold spaces, which would split `aria-describedby`
function renderTile(context: RenderInput, { actions, asset, index }: TileInput) {
	const labelId = `${context.id}-asset-${String(index)}`;
	const badge = createElement('span', { class: 'share-kit-badge' }, [context.strings.suggested]);

	badge.inert = true;

	return createElement('li', { class: 'share-kit-tile', 'data-share-kit-asset': asset.id }, [
		createElement('div', { class: 'share-kit-tile-label' }, [
			createElement('span', { id: labelId }, [asset.label]),
			badge,
		]),
		createElement('img', {
			alt: asset.alt,
			class: 'share-kit-preview',
			decoding: 'async',
			height: String(asset.height),
			loading: 'lazy',
			src: asset.previewSrc,
			width: String(asset.width),
		}),
		createElement(
			'div',
			{ class: 'share-kit-actions' },
			actions.map(([action, label]) => renderAction({ action, describedBy: labelId, label })),
		),
	]);
}

function getAssetActions({ capabilities, strings }: RenderInput) {
	const actions: Array<[string, string]> = [];
	// A desktop share sheet reaches little beyond Mail and AirDrop, and a phone's already offers copying
	const canShare = capabilities.has('files') && capabilities.has('mobile');

	if (canShare) actions.push(['share', strings.assetShare]);
	if (!canShare && capabilities.has('copy-image')) actions.push(['copy', strings.assetCopy]);

	actions.push(['save', strings.assetSave]);

	return actions;
}

function renderImages(context: RenderInput) {
	const { capabilities, payload, strings } = context;
	const actions = getAssetActions(context);
	const assets = new Map<HTMLElement, ShareKitAsset>();

	for (const [index, asset] of payload.assets.entries()) {
		assets.set(renderTile(context, { actions, asset, index }), asset);
	}

	const grid = createElement('ul', { class: 'share-kit-grid' }, [...assets.keys()]);

	return {
		assets,
		grid,
		section: createElement('section', { class: 'share-kit-section' }, [
			renderHeading([strings.imagesTitle]),
			createElement('p', { class: 'share-kit-hint' }, [
				capabilities.has('mobile') ? strings.imagesHintMobile : strings.imagesHint,
			]),
			grid,
		]),
	};
}

function renderLink(context: RenderInput) {
	const { capabilities, strings } = context;
	const link = createElement('p', { class: 'share-kit-link' });
	const qr = capabilities.has('mobile')
		? undefined
		: createElement(
				'button',
				{
					'aria-haspopup': 'dialog',
					class: 'share-kit-action',
					'data-share-kit-action': 'qr',
					type: 'button',
				},
				[strings.qrToggle],
			);

	return {
		link,
		section: createElement('section', { class: 'share-kit-section' }, [
			renderHeading([strings.linkTitle]),
			createElement('div', { class: 'share-kit-link-row' }, [
				link,
				createElement('span', { class: 'share-kit-actions' }, [
					renderAction({ action: 'copy-link', label: strings.linkCopy }),
					qr,
				]),
			]),
		]),
	};
}

export interface ShareKitParts {
	alert: HTMLElement;
	assets: ReadonlyMap<HTMLElement, ShareKitAsset>;
	caption: HTMLTextAreaElement;
	captionCopy: HTMLElement;
	captionLabel: HTMLElement;
	captionSection: HTMLElement;
	count: HTMLElement;
	dialog: HTMLDialogElement;
	grid: HTMLElement;
	heading: HTMLElement;
	hint: HTMLElement;
	imagesSection: HTMLElement;
	link: HTMLElement;
	primary: HTMLButtonElement;
	reset: HTMLElement;
	status: HTMLElement;
	tiles: Array<HTMLElement>;
}

export function renderShareKit(context: RenderInput): ShareKitParts {
	const { header, heading } = renderHeader(context);
	const destinations = renderDestinations(context);
	const caption = renderCaption(context);
	const images = renderImages(context);
	const link = renderLink(context);
	const status = createElement('p', { class: 'share-kit-status', role: 'status' });
	const primary = createElement('button', {
		class: 'share-kit-primary',
		'data-share-kit-action': 'primary',
		type: 'button',
	});
	const dialog = createElement(
		'dialog',
		{ 'aria-labelledby': heading.id, class: 'share-kit-dialog', closedby: 'any', id: context.id },
		[
			createElement('div', { class: 'share-kit-body' }, [
				header,
				createElement('div', { class: 'share-kit-scroll' }, [
					destinations.section,
					caption.section,
					images.section,
					link.section,
				]),
				createElement('footer', { class: 'share-kit-footer' }, [status, primary]),
			]),
		],
	);

	dialog.style.setProperty('--_share-kit-destination-count', String(context.destinations.length));

	return {
		alert: caption.alert,
		assets: images.assets,
		caption: caption.caption,
		captionCopy: caption.captionCopy,
		captionLabel: caption.captionLabel,
		captionSection: caption.section,
		count: caption.count,
		dialog,
		grid: images.grid,
		heading,
		hint: destinations.hint,
		imagesSection: images.section,
		link: link.link,
		primary,
		reset: caption.reset,
		status,
		tiles: [...images.assets.keys()],
	};
}
