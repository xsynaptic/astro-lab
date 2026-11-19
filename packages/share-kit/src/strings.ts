import type { ShareKitDestination, ShareKitDestinationIdOf } from './destinations.js';

export const shareKitStringDefaults = {
	assetCopy: 'Copy',
	assetSave: 'Save',
	assetShare: 'Share',
	captionOver: '{count} over the limit for {destination}',
	captionReset: 'Reset',
	close: 'Close',
	copied: 'Copied',
	copyManual: "Couldn't copy. The text is selected, so you can copy it yourself.",
	copyText: 'Copy text',
	copyTitle: 'Copy title',
	countOver: '{count} over',
	destinationsTitle: 'Post to',
	error: 'Something went wrong. Try saving instead.',
	fieldText: 'Text',
	fieldTitle: 'Title',
	imagesHint: 'Save or copy one, then add it to your post.',
	imagesHintMobile: 'Share one straight to an app, or save it.',
	imagesTitle: 'Images',
	linkCopy: 'Copy link',
	linkTitle: 'Link',
	primaryOpen: 'Open {destination}',
	primarySaveImage: 'Save image',
	primaryShareImage: 'Share image',
	primaryShareLink: 'Share link',
	primaryShareText: 'Share',
	qrAlt: 'QR code for this page',
	qrTitle: 'Scan to continue on your phone',
	qrToggle: 'Open on phone',
	retry: 'Ready. Tap again to share.',
	saved: 'Saved',
	saveError: "Couldn't save. Try again.",
	suggested: 'Suggested',
	title: 'Share this page',
} as const;

export type ShareKitStringKey = keyof typeof shareKitStringDefaults;

type DestinationStringKey<Id extends string> = `destination.${Id}` | `hint.${Id}`;

export type ShareKitDestinationHintKey<
	Destinations extends ReadonlyArray<ShareKitDestination<string>>,
> =
	`hint.${ShareKitDestinationIdOf<ReadonlyArray<Extract<Destinations[number], { hint: string }>>>}`;

export type ShareKitDestinationStringKey<
	Destinations extends ReadonlyArray<ShareKitDestination<string>>,
> =
	`destination.${ShareKitDestinationIdOf<Destinations>}` | ShareKitDestinationHintKey<Destinations>;

export type ShareKitStrings<Id extends string> = Partial<Record<DestinationStringKey<Id>, string>> &
	Record<ShareKitStringKey, string>;

const destinationStringPattern = /^(?:destination|hint)\.(.+)$/u;

function isShareStringKey(key: string): key is ShareKitStringKey {
	return Object.hasOwn(shareKitStringDefaults, key);
}

function isDestinationStringKey(
	key: string,
	ids: ReadonlySet<string>,
): key is DestinationStringKey<string> {
	const id = destinationStringPattern.exec(key)?.[1];

	return id !== undefined && ids.has(id);
}

export function getShareStrings(
	overrides: Partial<Record<string, unknown>>,
	ids: ReadonlySet<string>,
): ShareKitStrings<string> {
	const strings: ShareKitStrings<string> = { ...shareKitStringDefaults };

	for (const [key, value] of Object.entries(overrides)) {
		if (typeof value !== 'string') continue;
		if (isShareStringKey(key) || isDestinationStringKey(key, ids)) strings[key] = value;
	}

	return strings;
}

interface LabelledDestination {
	hint?: string;
	id: string;
	label: string;
}

export function getDestinationLabel(
	strings: ShareKitStrings<string>,
	{ id, label }: LabelledDestination,
) {
	return strings[`destination.${id}`] ?? label;
}

export function getDestinationHint(
	strings: ShareKitStrings<string>,
	{ hint, id }: LabelledDestination,
) {
	return strings[`hint.${id}`] ?? hint;
}

export function createNumberFormat(locale: string) {
	try {
		return new Intl.NumberFormat(locale);
	} catch {
		return new Intl.NumberFormat();
	}
}

export function formatShareString(template: string, values: Record<string, string>) {
	return template.replaceAll(/\{(\w+)\}/gu, (match, name: string) => values[name] ?? match);
}
