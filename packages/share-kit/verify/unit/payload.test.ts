import { afterEach, describe, expect, test, vi } from 'vitest';

import type { ShareKitDestination } from '../../src/destinations.js';

import { shareKitCountLength } from '../../src/count.js';
import {
	defineShareKitDestination,
	shareKitAnywhere,
	shareKitBluesky,
	shareKitThreads,
	shareKitX,
} from '../../src/destinations.js';
import { shareKitLandscapeFormat } from '../../src/formats.js';
import {
	getShareAssets,
	getShareDestinations,
	serializeShareKitPayload,
} from '../../src/payload.js';
import { getDestinationHint, getDestinationLabel, getShareStrings } from '../../src/strings.js';

const line = defineShareKitDestination({
	actions: { desktop: ['open-composer'], mobile: ['open-composer'] },
	composer: ({ text }) => `https://line.me/R/share?text=${encodeURIComponent(text)}`,
	count: shareKitCountLength,
	hint: 'LINE takes the caption as a message.',
	id: 'line',
	images: [shareKitLandscapeFormat],
	label: 'LINE',
	shape: 'full',
});

const catalogue = new Map<string, ShareKitDestination<string>>(
	[shareKitAnywhere, shareKitBluesky, shareKitThreads, shareKitX, line].map((destination) => [
		destination.id,
		destination,
	]),
);

function getIds(settings: string) {
	return getShareDestinations(JSON.parse(settings), catalogue)?.map(({ id }) => id);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('serializeShareKitPayload', () => {
	test('leaves no `<` to close the script element, and parses back unchanged', () => {
		const payload = {
			assets: [],
			locale: 'en',
			settings: { destinations: ['any'] as const },
			title: '</script><script>alert(1)</script>',
			url: 'https://example.com/',
		};
		const serialized = serializeShareKitPayload(payload);

		expect(serialized).not.toContain('<');
		expect(JSON.parse(serialized)).toEqual(payload);
	});
});

describe('getShareDestinations', () => {
	test('drops unregistered and repeated ids, with one warning', () => {
		const warn = vi.spyOn(console, 'warn').mockReturnValue();

		expect(getIds('{"destinations":["x","x","nope","line","threads","gone"]}')).toEqual([
			'x',
			'line',
			'threads',
		]);
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0]?.[0]).toContain('nope, gone');
	});

	test('leaves nothing to render when no id is registered, and says so', () => {
		const warn = vi.spyOn(console, 'warn').mockReturnValue();

		expect(getIds('{"destinations":"x"}')).toBeUndefined();
		expect(warn).toHaveBeenLastCalledWith('share-kit: no registered destinations to show');
		expect(getIds('{"destinations":["nope"]}')).toBeUndefined();
	});
});

describe('getShareAssets', () => {
	const asset = {
		...shareKitLandscapeFormat,
		alt: '',
		filename: 'card.jpg',
		label: 'Card',
		previewSrc: '/card.jpg',
		src: '/card.jpg',
		type: 'image/jpeg',
	};

	test('drops an empty or repeated id with a warning, keeping the first', () => {
		const warn = vi.spyOn(console, 'warn').mockReturnValue();
		const kept = getShareAssets([asset, { ...asset, label: 'Again' }, { ...asset, id: '' }]);

		expect(kept).toEqual([asset]);
		expect(warn).toHaveBeenCalledOnce();
	});

	test('keeps an id with spaces, since DOM ids never come from it', () => {
		const spaced = { ...asset, id: 'photo 1' };

		expect(getShareAssets([spaced])).toEqual([spaced]);
	});
});

describe('strings', () => {
	const strings = getShareStrings(
		{
			'destination.line': 'ライン',
			'destination.nope': 'Nope',
			'hint.x': 'Tweet it.',
			title: 'Teilen',
		},
		new Set(catalogue.keys()),
	);

	test('overrides a label or hint for a registered id, custom ones included', () => {
		expect(strings.title).toBe('Teilen');
		expect(getDestinationLabel(strings, line)).toBe('ライン');
		expect(getDestinationHint(strings, shareKitX)).toBe('Tweet it.');
	});

	test("falls back to the definition's label and hint, and ignores unregistered ids", () => {
		expect(getDestinationLabel(strings, shareKitBluesky)).toBe('Bluesky');
		expect(getDestinationHint(strings, line)).toBe('LINE takes the caption as a message.');
		expect(getDestinationHint(strings, shareKitBluesky)).toBeUndefined();
		expect(strings['destination.nope']).toBeUndefined();
	});
});

test('the entry imports where there is no DOM, as in server rendering', async () => {
	await expect(import('../../src/index.js')).resolves.toHaveProperty('defineShareKit');
});
