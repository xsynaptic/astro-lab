import type { ShareKitDestination } from './destinations.js';
import type { ShareKitAsset, ShareKitPayload, ShareKitSettings } from './types.js';

function isPayload(value: unknown): value is ShareKitPayload<string> {
	if (typeof value !== 'object' || value === null) return false;

	const { assets, settings, title, url }: Partial<Record<keyof ShareKitPayload<string>, unknown>> =
		value;

	return (
		typeof title === 'string' &&
		typeof url === 'string' &&
		Array.isArray(assets) &&
		typeof settings === 'object' &&
		settings !== null
	);
}

// `<` is escaped so a title or description can't close the script element early
export function serializeShareKitPayload(payload: ShareKitPayload<string>) {
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

type Catalogue = ReadonlyMap<string, ShareKitDestination<string>>;

function getIds(value: unknown) {
	if (!Array.isArray(value)) return [];

	return [...new Set<unknown>(value)];
}

// The payload arrives as JSON, so ids are checked again; an empty row would leave the radio group unreachable
export function getDestinationLists(
	{ destinations, destinationsMore }: ShareKitSettings<string>,
	catalogue: Catalogue,
) {
	const unknown: Array<string> = [];
	const resolve = (ids: Array<unknown>) =>
		ids.flatMap((id) => {
			const destination = typeof id === 'string' ? catalogue.get(id) : undefined;

			if (!destination) unknown.push(String(id));

			return destination ? [destination] : [];
		});
	const shown = resolve(getIds(destinations));
	const rest = resolve(getIds(destinationsMore)).filter(
		(destination) => !shown.includes(destination),
	);

	if (unknown.length > 0) {
		console.warn(`share-kit: unregistered destinations dropped: ${unknown.join(', ')}`);
	}

	if (shown.length > 0) return { main: shown, more: rest };
	if (rest.length > 0) return { main: rest, more: [] };

	console.warn('share-kit: no registered destinations to show');

	return;
}

export function getShareAssets(assets: ReadonlyArray<ShareKitAsset>) {
	const seen = new Set<string>();
	const kept = assets.filter((asset) => {
		const id: unknown = asset.id;

		if (typeof id !== 'string' || id === '' || seen.has(id)) return false;

		seen.add(id);

		return true;
	});

	if (kept.length < assets.length) {
		console.warn('share-kit: images with an empty or repeated id dropped');
	}

	return kept;
}
