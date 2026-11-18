import type { ShareCapability } from './actions.js';
import type { ShareKitDestination } from './destinations.js';
import type { ShareKitIcons } from './icons.js';
import type { ShareKitStrings } from './strings.js';
import type { ShareKitAsset, ShareKitClassRole, ShareKitPayload } from './types.js';

import { createElement, createIconSlot, joinClasses } from './dom.js';
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

interface RenderContext extends RenderInput {
	classNames: Partial<Record<ShareKitClassRole, string>>;
}

// No slot for an icon that will never come
function renderDestinationIcon({ icons, isIconsLoading }: RenderContext, name: string) {
	const path = icons[name];

	return path || isIconsLoading ? createIconSlot(name, path) : undefined;
}

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
	fallback: string;
	icon: string;
	label: string;
}

function renderIconButton(
	{ icons }: RenderContext,
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

function renderHeader(context: RenderContext) {
	const { id, strings } = context;
	const heading = createElement(
		'h2',
		{ class: 'share-kit-title', id: `${id}-title`, tabindex: '-1' },
		[strings.title],
	);
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

function renderDestination(context: RenderContext, destination: ShareKitDestination<string>) {
	const { classNames, strings } = context;

	return createElement(
		'button',
		{
			'aria-checked': 'false',
			class: joinClasses('share-kit-destination', classNames.destination),
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

function renderDestinationRow(context: RenderContext) {
	const { destinations, id, strings } = context;
	const headingId = `${id}-destinations`;
	const group = createElement(
		'div',
		{ 'aria-labelledby': headingId, class: 'share-kit-destinations', role: 'radiogroup' },
		destinations.map((destination) => renderDestination(context, destination)),
	);

	return [
		renderHeading(context, [strings.destinationsTitle], headingId),
		createElement('div', { class: 'share-kit-destinations-row' }, [group]),
	];
}

function renderDestinations(context: RenderContext) {
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

function renderCaption(context: RenderContext) {
	const { classNames, id, payload, strings } = context;
	const captionId = `${id}-caption`;
	const countId = `${id}-count`;
	const caption = createElement('textarea', {
		'aria-describedby': `${countId} ${id}-hint`,
		class: joinClasses('share-kit-caption', classNames.input),
		dir: 'auto',
		id: captionId,
		lang: payload.locale,
	});
	const count = createElement('span', { class: 'share-kit-count', id: countId });
	const captionCopy = renderAction(context, { action: 'copy-caption', label: '' });
	const reset = renderAction(context, { action: 'reset', label: strings.captionReset });
	const label = createElement('label', { for: captionId });
	const alert = createElement('p', { class: 'share-kit-visually-hidden', role: 'status' });

	reset.hidden = true;

	return {
		alert,
		caption,
		captionCopy,
		captionLabel: label,
		count,
		reset,
		section: createElement('section', { class: 'share-kit-section' }, [
			renderHeading(context, [label]),
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
function renderTile(context: RenderContext, { actions, asset, index }: TileInput) {
	const labelId = `${context.id}-asset-${String(index)}`;
	const badge = createElement('span', { class: 'share-kit-badge' }, [context.strings.suggested]);

	badge.hidden = true;

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
			actions.map(([action, label]) =>
				renderAction(context, { action, describedBy: labelId, label }),
			),
		),
	]);
}

function getAssetActions({ capabilities, strings }: RenderContext) {
	const actions: Array<[string, string]> = [];
	// A desktop share sheet reaches little beyond Mail and AirDrop, and a phone's already offers copying
	const canShare = capabilities.has('files') && capabilities.has('mobile');

	if (canShare) actions.push(['share', strings.assetShare]);
	if (!canShare && capabilities.has('copy-image')) actions.push(['copy', strings.assetCopy]);

	actions.push(['save', strings.assetSave]);

	return actions;
}

function renderImages(context: RenderContext) {
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
			renderHeading(context, [strings.imagesTitle]),
			createElement('p', { class: 'share-kit-hint' }, [
				capabilities.has('mobile') ? strings.imagesHintMobile : strings.imagesHint,
			]),
			grid,
		]),
	};
}

function renderLink(context: RenderContext) {
	const { capabilities, strings } = context;
	const link = createElement('p', { class: 'share-kit-link' });
	const qr = capabilities.has('mobile')
		? undefined
		: createElement(
				'button',
				{
					'aria-haspopup': 'dialog',
					class: joinClasses('share-kit-action', context.classNames.action),
					'data-share-kit-action': 'qr',
					type: 'button',
				},
				[strings.qrToggle],
			);

	return {
		link,
		section: createElement('section', { class: 'share-kit-section' }, [
			renderHeading(context, [strings.linkTitle]),
			createElement('div', { class: 'share-kit-link-row' }, [
				link,
				createElement('span', { class: 'share-kit-actions' }, [
					renderAction(context, { action: 'copy-link', label: strings.linkCopy }),
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
	link: HTMLElement;
	primary: HTMLButtonElement;
	reset: HTMLElement;
	status: HTMLElement;
	tiles: Array<HTMLElement>;
}

export function renderShareKit(input: RenderInput): ShareKitParts {
	const context: RenderContext = { ...input, classNames: input.payload.settings.classNames ?? {} };
	const { header, heading } = renderHeader(context);
	const destinations = renderDestinations(context);
	const caption = renderCaption(context);
	const images = renderImages(context);
	const link = renderLink(context);
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
					link.section,
				]),
				createElement('footer', { class: 'share-kit-footer' }, [status, primary]),
			]),
		],
	);

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
		link: link.link,
		primary,
		reset: caption.reset,
		status,
		tiles: [...images.assets.keys()],
	};
}
