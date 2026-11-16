import type { ImageSource } from '@xsynaptic/astro-image-pipeline/names';
import type { ShareKitAsset, ShareKitPayload, ShareKitSettings } from '@xsynaptic/share-kit';

import { getCardName, getRenditionName } from '@xsynaptic/astro-image-pipeline/names';

const imageBaseUrl = '/images';

const cardBaseUrl = '/og';

const photoFileWidth = 1800;

const photoPreviewWidth = 600;

// Dimensions match scripts/generate-fixtures.ts
const photoSources: Array<ImageSource & { alt: string }> = [
	{ alt: 'The sea at dusk', height: 1333, id: 'sea-at-dusk.jpg', width: 2000 },
	{ alt: 'The tower from the rocks below', height: 1875, id: 'lighthouse-tower.jpg', width: 1500 },
];

export const cardSizes = {
	landscape: { height: 630, width: 1200 },
	portrait: { height: 1350, width: 1080 },
	story: { height: 1920, width: 1080 },
} as const;

const cardVariants = ['portrait', 'story', 'landscape'] as const;

const cardLabels = {
	landscape: 'Landscape',
	portrait: 'Portrait',
	story: 'Story',
} as const;

const title = "The Lighthouse Keeper's Cat";

const filenamePrefix = 'lighthouse-cat';

export const sampleSettings = {
	destinations: ['any', 'bluesky', 'instagram', 'instagram-story', 'threads'],
	destinationsMore: ['mastodon', 'x', 'facebook', 'pinterest', 'reddit', 'linkedin', 'messages'],
	utmMedium: 'share',
} as const satisfies ShareKitSettings;

function getCardAsset(variant: (typeof cardVariants)[number]): ShareKitAsset {
	const name = getCardName(
		{ id: `${filenamePrefix}-${variant}`, input: { title, variant } },
		{ format: 'jpg' },
	);
	const src = `${cardBaseUrl}/${name}`;

	return {
		...cardSizes[variant],
		alt: `${title}, ${cardLabels[variant].toLowerCase()} card`,
		filename: `${filenamePrefix}-${variant}.jpg`,
		label: cardLabels[variant],
		previewSrc: src,
		role: variant,
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
		label: `Photo ${number}`,
		previewSrc: `${imageBaseUrl}/${previewName}`,
		role: 'photo',
		src: `${imageBaseUrl}/${fileName}`,
		type: 'image/jpeg',
		width: photoPreviewWidth,
	};
}

export function getSamplePayload(): ShareKitPayload {
	return {
		assets: [...cardVariants.map(getCardAsset), ...photoSources.map(getPhotoAsset)],
		description:
			'On foggy nights the keeper climbs the tower to trim the wick, and the cat climbs after. Nobody taught her the way up. She waits at the top, watching the beam sweep across the water, until the last boat is safely past.',
		locale: 'en',
		settings: sampleSettings,
		title,
		url: 'https://example.com/lighthouse-keepers-cat/',
	};
}
