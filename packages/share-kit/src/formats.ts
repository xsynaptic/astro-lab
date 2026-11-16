export interface ShareKitImageFormat {
	height: number;
	id: string;
	width: number;
}

export const shareKitLandscapeFormat = {
	height: 630,
	id: 'landscape',
	width: 1200,
} as const satisfies ShareKitImageFormat;

export const shareKitPortraitFormat = {
	height: 1350,
	id: 'portrait',
	width: 1080,
} as const satisfies ShareKitImageFormat;

export const shareKitStoryFormat = {
	height: 1920,
	id: 'story',
	width: 1080,
} as const satisfies ShareKitImageFormat;

export const shareKitPinFormat = {
	height: 1500,
	id: 'pin',
	width: 1000,
} as const satisfies ShareKitImageFormat;

export type ShareKitImageFormats = readonly [ShareKitImageFormat, ...Array<ShareKitImageFormat>];

interface ShareImage {
	height: number;
	isSuggestable?: boolean;
	width: number;
}

const fitTolerance = 0.02;

function getRatioDistance(
	image: Pick<ShareImage, 'height' | 'width'>,
	format: ShareKitImageFormat,
) {
	return Math.abs(Math.log(image.width / image.height / (format.width / format.height)));
}

function isFormatFit(image: Pick<ShareImage, 'height' | 'width'>, format: ShareKitImageFormat) {
	return getRatioDistance(image, format) <= fitTolerance;
}

export function getSuggestedImage<Image extends ShareImage>(
	images: ReadonlyArray<Image>,
	formats: ShareKitImageFormats,
) {
	const candidates = images.filter((image) => image.isSuggestable !== false);

	for (const format of formats) {
		const match = candidates.find((image) => isFormatFit(image, format));

		if (match) return match;
	}

	let nearest: Image | undefined;
	let nearestDistance = Infinity;

	for (const image of candidates) {
		const distance = getRatioDistance(image, formats[0]);

		// Also skips a `NaN` distance from an image without dimensions
		if (!(distance < nearestDistance)) continue;

		nearest = image;
		nearestDistance = distance;
	}

	return nearest;
}

export function getShareKitImageFormats(
	destinations: ReadonlyArray<{ images: ShareKitImageFormats }>,
) {
	const formats = new Map<string, ShareKitImageFormat>();

	for (const { images } of destinations) {
		if (!formats.has(images[0].id)) formats.set(images[0].id, images[0]);
	}

	return [...formats.values()];
}
