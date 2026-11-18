import type { ImageSource } from '@xsynaptic/astro-image-pipeline/names';
import type {
	ShareKitAsset,
	ShareKitImageFormat,
	ShareKitPayload,
	ShareKitSettings,
} from '@xsynaptic/share-kit';

import { getCardName, getRenditionName } from '@xsynaptic/astro-image-pipeline/names';
import { getShareKitImageFormats } from '@xsynaptic/share-kit';

import type { Destination } from './destinations.js';

import { destinations } from './destinations.js';

const imageBaseUrl = '/images';

const cardBaseUrl = '/og';

const photoFileWidth = 1800;

const photoPreviewWidth = 600;

// Dimensions match scripts/generate-fixtures.ts
const photoSources: Array<ImageSource & { alt: string }> = [
	{ alt: 'The sea at dusk', height: 1333, id: 'sea-at-dusk.jpg', width: 2000 },
	{ alt: 'The tower from the rocks below', height: 1875, id: 'lighthouse-tower.jpg', width: 1500 },
];

export const cardFormats = getShareKitImageFormats(destinations);

const title = "The Lighthouse Keeper's Cat";

const filenamePrefix = 'lighthouse-cat';

export const sampleSettings = {
	destinations: [
		'any',
		'bluesky',
		'instagram',
		'instagram-story',
		'threads',
		'mastodon',
		'x',
		'facebook',
		'pinterest',
		'reddit',
		'linkedin',
		'line',
		'email',
	],
	utmMedium: 'share',
} as const satisfies ShareKitSettings<Destination>;

function getCardAsset(format: ShareKitImageFormat): ShareKitAsset {
	const name = getCardName(
		{ id: `${filenamePrefix}-${format.id}`, input: { title, variant: format.id } },
		{ format: 'jpg' },
	);
	const src = `${cardBaseUrl}/${name}`;
	const label = `${format.id.charAt(0).toUpperCase()}${format.id.slice(1)}`;

	return {
		...format,
		alt: `${title}, ${format.id} card`,
		filename: `${filenamePrefix}-${format.id}.jpg`,
		label,
		previewSrc: src,
		src,
		type: 'image/jpeg',
	};
}

// Asking for a rendition name is what makes the pipeline serve it in dev
function getPhotoAsset(source: ImageSource & { alt: string }, index: number): ShareKitAsset {
	const fileWidth = Math.min(photoFileWidth, source.width);
	const previewName = getRenditionName(source, { format: 'jpg', width: photoPreviewWidth });
	const fileName = getRenditionName(source, { format: 'jpg', width: fileWidth });
	const number = String(index + 1);

	return {
		alt: source.alt,
		filename: `${filenamePrefix}-${number}.jpg`,
		height: Math.round((photoPreviewWidth * source.height) / source.width),
		id: `photo-${number}`,
		isSuggestable: false,
		label: `Photo ${number}`,
		previewSrc: `${imageBaseUrl}/${previewName}`,
		src: `${imageBaseUrl}/${fileName}`,
		type: 'image/jpeg',
		width: photoPreviewWidth,
	};
}

export function getSamplePayload(): ShareKitPayload<Destination> {
	return {
		assets: [...cardFormats.map(getCardAsset), ...photoSources.map(getPhotoAsset)],
		description:
			'On foggy nights the keeper climbs the tower to trim the wick, and the cat climbs after. Nobody taught her the way up. She waits at the top, watching the beam sweep across the water, until the last boat is safely past.',
		locale: 'en',
		settings: sampleSettings,
		title,
		url: 'https://example.com/lighthouse-keepers-cat/',
	};
}
