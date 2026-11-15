import type { ShareKitDestinationId } from './destinations.js';
import type { ShareKitStrings } from './strings.js';
import type { ShareKitPayload, ShareKitSettings } from './types.js';

import { isShareDestinationId, shareDestinationAny } from './destinations.js';
import { isShareStringKey, shareKitStringDefaults } from './strings.js';

function isPayload(value: unknown): value is ShareKitPayload {
	if (typeof value !== 'object' || value === null) return false;

	const { assets, settings, title, url }: Partial<Record<keyof ShareKitPayload, unknown>> = value;

	return (
		typeof title === 'string' &&
		typeof url === 'string' &&
		Array.isArray(assets) &&
		typeof settings === 'object' &&
		settings !== null
	);
}

// `<` is escaped so a title or description can't close the script element early
export function serializeShareKitPayload(payload: ShareKitPayload) {
	return JSON.stringify(payload).replaceAll('<', String.raw`\u003c`);
}

export function readSharePayload(host: HTMLElement) {
	const source = host.querySelector(':scope > script[type="application/json"]')?.textContent;

	if (!source) return;

	try {
		const value: unknown = JSON.parse(source);

		return isPayload(value) ? value : undefined;
	} catch {
		return;
	}
}

export function getShareStrings(overrides: Partial<Record<string, string>> = {}): ShareKitStrings {
	const strings: ShareKitStrings = { ...shareKitStringDefaults };

	for (const [key, value] of Object.entries(overrides)) {
		if (value !== undefined && isShareStringKey(key)) strings[key] = value;
	}

	return strings;
}

function getIds(value: unknown) {
	if (!Array.isArray(value)) return [];

	return [...new Set<unknown>(value)].filter(
		(id): id is ShareKitDestinationId => typeof id === 'string' && isShareDestinationId(id),
	);
}

// The payload arrives as JSON, so ids are checked again; an empty row would leave the radio group unreachable
export function getDestinationLists({ destinations, destinationsMore }: ShareKitSettings) {
	const shown = getIds(destinations);
	const main: Array<ShareKitDestinationId> = shown.length > 0 ? shown : [shareDestinationAny];
	const more = getIds(destinationsMore).filter((id) => !main.includes(id));

	return { main, more };
}
