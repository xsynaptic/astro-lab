import type { ShareCapability } from './actions.js';
import type { ShareKitDestinationId } from './destinations.js';
import type { ShareKitIcons } from './icons.js';
import type { ShareKitStrings } from './strings.js';
import type { ShareKitAsset, ShareKitClassRole, ShareKitPayload } from './types.js';

import { createElement, createIcon, joinClasses } from './dom.js';

interface RenderInput {
	capabilities: ReadonlySet<ShareCapability>;
	destinations: Array<ShareKitDestinationId>;
	destinationsMore: Array<ShareKitDestinationId>;
	icons: ShareKitIcons;
	id: string;
	payload: ShareKitPayload;
	strings: ShareKitStrings;
}

type RenderContext = RenderInput & {
	classNames: Partial<Record<ShareKitClassRole, string>>;
};

const destinationIconSize = 24;

interface ActionInput {
	action: string;
	describedBy?: string;
	label: string;
}

function renderAction({ classNames }: RenderContext, { action, describedBy, label }: ActionInput) {
	return createElement(
		'button',
		{
			'aria-describedby': describedBy,
			class: joinClasses('share-kit-action', classNames.action),
			'data-share-kit-action': action,
			type: 'button',
		},
		[label],
	);
}

function renderHeading({ classNames }: RenderContext, children: Array<Node | string>, id?: string) {
	return createElement(
		'h3',
		{ class: joinClasses('share-kit-heading', classNames.heading), id },
		children,
	);
}

interface IconButtonInput {
	action: string;
	attributes?: Record<string, string>;
	fallback: string;
	icon: string | undefined;
	label: string;
}

function renderIconButton({ action, attributes, fallback, icon, label }: IconButtonInput) {
	return createElement(
		'button',
		{
			...attributes,
			'aria-label': label,
			class: 'share-kit-icon-button',
			'data-share-kit-action': action,
			title: label,
			type: 'button',
		},
		[icon ? createIcon(icon, destinationIconSize) : fallback],
	);
}

function renderHeader(context: RenderContext) {
	const { capabilities, icons, id, strings } = context;
	const heading = createElement(
		'h2',
		{ class: 'share-kit-title', id: `${id}-title`, tabindex: '-1' },
		[strings.title],
	);
	const qrToggle = capabilities.has('handheld')
		? undefined
		: renderIconButton({
				action: 'qr',
				attributes: { 'aria-haspopup': 'dialog' },
				fallback: 'QR',
				icon: icons.qr,
				label: strings.qrToggle,
			});
	const close = renderIconButton({
		action: 'close',
		fallback: '×',
		icon: icons.close,
		label: strings.close,
	});

	return {
		header: createElement('header', { class: 'share-kit-header' }, [
			heading,
			createElement('div', { class: 'share-kit-header-actions' }, [qrToggle, close]),
		]),
		heading,
	};
}

function renderDestination(context: RenderContext, destination: ShareKitDestinationId) {
	const { classNames, icons, strings } = context;
	const icon = icons[destination];

	return createElement(
		'button',
		{
			'aria-checked': 'false',
			class: joinClasses('share-kit-destination', classNames.destination),
			'data-share-kit-action': 'destination',
			'data-share-kit-destination': destination,
			role: 'radio',
			tabindex: '-1',
			type: 'button',
		},
		[
			icon ? createIcon(icon, destinationIconSize) : undefined,
			createElement('span', {}, [strings[`destination.${destination}`]]),
		],
	);
}

function renderDestinations(context: RenderContext) {
	const { destinations, destinationsMore, icons, id, strings } = context;
	const headingId = `${id}-destinations`;
	const more =
		destinationsMore.length > 0
			? createElement(
					'button',
					{
						class: joinClasses('share-kit-destination', context.classNames.destination),
						'data-share-kit-action': 'more',
						type: 'button',
					},
					[
						icons.more ? createIcon(icons.more, destinationIconSize) : undefined,
						createElement('span', {}, [strings.destinationsMore]),
					],
				)
			: undefined;
	const extra = destinationsMore.map((destination) => {
		const button = renderDestination(context, destination);

		button.hidden = true;

		return button;
	});
	const group = createElement(
		'div',
		{ 'aria-labelledby': headingId, class: 'share-kit-destinations', role: 'radiogroup' },
		[...destinations.map((destination) => renderDestination(context, destination)), ...extra],
	);

	return {
		more,
		section: createElement('section', { class: 'share-kit-section' }, [
			renderHeading(context, [strings.destinationsTitle], headingId),
			createElement('div', { class: 'share-kit-destinations-row' }, [group, more]),
		]),
	};
}

function renderCaption(context: RenderContext) {
	const { classNames, id, payload, strings } = context;
	const captionId = `${id}-caption`;
	const countId = `${id}-count`;
	const hintId = `${id}-hint`;
	const caption = createElement('textarea', {
		'aria-describedby': `${countId} ${hintId}`,
		class: joinClasses('share-kit-caption', classNames.input),
		dir: 'auto',
		id: captionId,
		lang: payload.locale,
		rows: '6',
	});
	const count = createElement('span', { class: 'share-kit-count', id: countId });
	const captionCopy = renderAction(context, { action: 'copy-caption', label: strings.captionCopy });
	const hint = createElement('p', { class: 'share-kit-hint', id: hintId });

	return {
		caption,
		captionCopy,
		count,
		hint,
		section: createElement('section', { class: 'share-kit-section' }, [
			renderHeading(context, [createElement('label', { for: captionId }, [strings.captionTitle])]),
			caption,
			createElement('div', { class: 'share-kit-caption-meta' }, [
				count,
				createElement('span', { class: 'share-kit-actions' }, [
					renderAction(context, { action: 'reset', label: strings.captionReset }),
					captionCopy,
				]),
			]),
			hint,
		]),
	};
}

interface TileInput {
	actions: Array<[action: string, label: string]>;
	asset: ShareKitAsset;
	key: string;
}

function renderTile(context: RenderContext, { actions, asset, key }: TileInput) {
	const labelId = `${context.id}-asset-${key}`;
	const badge = createElement('span', { class: 'share-kit-badge' }, [context.strings.suggested]);

	badge.hidden = true;

	return createElement(
		'li',
		{
			class: 'share-kit-tile',
			'data-share-kit-asset': key,
			'data-share-kit-role': asset.role,
		},
		[
			createElement('img', {
				alt: asset.alt,
				class: 'share-kit-preview',
				decoding: 'async',
				height: String(asset.height),
				loading: 'lazy',
				src: asset.previewSrc,
				width: String(asset.width),
			}),
			createElement('div', { class: 'share-kit-tile-label' }, [
				createElement('span', { id: labelId }, [asset.label]),
				badge,
			]),
			createElement(
				'div',
				{ class: 'share-kit-actions' },
				actions.map(([action, label]) =>
					renderAction(context, { action, describedBy: labelId, label }),
				),
			),
		],
	);
}

function getAssetActions({ capabilities, strings }: RenderContext) {
	const actions: Array<[string, string]> = [];
	const canShare = capabilities.has('files');

	if (canShare) actions.push(['share', strings.assetShare]);

	// On a phone the share sheet already offers copying
	if (capabilities.has('copy-image') && !(canShare && capabilities.has('handheld'))) {
		actions.push(['copy', strings.assetCopy]);
	}

	actions.push(['save', strings.assetSave]);

	return actions;
}

function renderImages(context: RenderContext) {
	const { payload, strings } = context;
	const actions = getAssetActions(context);
	const counts = new Map<string, number>();
	const assets = new Map<HTMLElement, ShareKitAsset>();

	for (const asset of payload.assets) {
		const number = (counts.get(asset.role) ?? 0) + 1;
		const key = asset.role === 'photo' ? `photo-${String(number)}` : asset.role;

		counts.set(asset.role, number);
		assets.set(renderTile(context, { actions, asset, key }), asset);
	}

	const grid = createElement('ul', { class: 'share-kit-grid' }, [...assets.keys()]);

	return {
		assets,
		grid,
		section: createElement('section', { class: 'share-kit-section' }, [
			renderHeading(context, [strings.imagesTitle]),
			grid,
		]),
	};
}

function renderLink(context: RenderContext) {
	const { payload, strings } = context;

	return createElement('section', { class: 'share-kit-section' }, [
		renderHeading(context, [strings.linkTitle]),
		createElement('div', { class: 'share-kit-link-row' }, [
			createElement('p', { class: 'share-kit-link' }, [payload.url]),
			renderAction(context, { action: 'copy-link', label: strings.linkCopy }),
		]),
	]);
}

export interface ShareKitParts {
	assets: ReadonlyMap<HTMLElement, ShareKitAsset>;
	caption: HTMLTextAreaElement;
	captionCopy: HTMLElement;
	count: HTMLElement;
	dialog: HTMLDialogElement;
	grid: HTMLElement;
	heading: HTMLElement;
	hint: HTMLElement;
	more: HTMLElement | undefined;
	primary: HTMLButtonElement;
	status: HTMLElement;
	tiles: Array<HTMLElement>;
}

export function renderShareKit(input: RenderInput): ShareKitParts {
	const context: RenderContext = { ...input, classNames: input.payload.settings.classNames ?? {} };
	const { header, heading } = renderHeader(context);
	const destinations = renderDestinations(context);
	const caption = renderCaption(context);
	const images = renderImages(context);
	const status = createElement('p', { class: 'share-kit-status', role: 'status' });
	const primary = createElement('button', {
		class: joinClasses('share-kit-primary', context.classNames.primary),
		'data-share-kit-action': 'primary',
		type: 'button',
	});
	const dialog = createElement(
		'dialog',
		{ 'aria-labelledby': heading.id, class: 'share-kit-dialog', closedby: 'any', id: input.id },
		[
			createElement('div', { class: 'share-kit-body' }, [
				header,
				createElement('div', { class: 'share-kit-scroll' }, [
					destinations.section,
					caption.section,
					images.section,
					renderLink(context),
				]),
				createElement('footer', { class: 'share-kit-footer' }, [status, primary]),
			]),
		],
	);

	return {
		assets: images.assets,
		caption: caption.caption,
		captionCopy: caption.captionCopy,
		count: caption.count,
		dialog,
		grid: images.grid,
		heading,
		hint: caption.hint,
		more: destinations.more,
		primary,
		status,
		tiles: [...images.assets.keys()],
	};
}
