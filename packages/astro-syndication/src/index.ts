import type { GetImageResult } from 'astro';

export interface SyndicationAuthor {
	name: string;
	url?: string;
}

export interface SyndicationImage {
	alt: string;
	height: number;
	type: string;
	url: string;
	width: number;
}

export interface SyndicationItem {
	authors?: Array<SyndicationAuthor>;
	contentHtml?: string;
	dateCreated: Date;
	dateUpdated?: Date;
	description?: string;
	image?: SyndicationImage;
	tags: Array<string>;
	title: string;
	url: string;
}

export interface SyndicationPublicationImage {
	height?: number;
	url: string;
	width?: number;
}

// Format-neutral; each format route adds its own self URL
export interface SyndicationPublication {
	copyright?: string;
	description: string;
	image?: SyndicationPublicationImage;
	language: string;
	// Takes `context.site` as is; writers throw when it is missing
	site: undefined | URL;
	title: string;
}

const millisecondsPerHour = 3_600_000;

const millisecondsPerDay = 86_400_000;

// Date-only values parse to 00:00 UTC, which future-dates today's entries east of UTC
export function anchorDateOnly(date: Date, { utcOffsetHours }: { utcOffsetHours: number }) {
	if (date.getTime() % millisecondsPerDay !== 0) return date;

	return new Date(date.getTime() - utcOffsetHours * millisecondsPerHour);
}

const imageMimeTypes = {
	avif: 'image/avif',
	gif: 'image/gif',
	jpeg: 'image/jpeg',
	jpg: 'image/jpeg',
	png: 'image/png',
	svg: 'image/svg+xml',
	webp: 'image/webp',
} as const;

function isMimeMappedFormat(format: string): format is keyof typeof imageMimeTypes {
	return Object.hasOwn(imageMimeTypes, format);
}

// `getImage()` reports the requested size, but sharp never enlarges past the source
function getRenderedSize({ attributes, options }: Pick<GetImageResult, 'attributes' | 'options'>) {
	const width = Number(attributes.width);
	const height = Number(attributes.height);

	if (typeof options.src === 'string') return { height, width };
	if (width <= options.src.width && height <= options.src.height) return { height, width };

	return { height: options.src.height, width: options.src.width };
}

export function toSyndicationImage(
	image: Pick<GetImageResult, 'attributes' | 'options' | 'src'>,
	{ alt }: { alt: string },
) {
	const { format } = image.options;

	if (!format || !isMimeMappedFormat(format)) {
		throw new Error(
			`astro-syndication: no MIME type is known for image format \`${String(format)}\`; pass \`format\` to \`getImage()\``,
		);
	}

	return {
		alt,
		type: imageMimeTypes[format],
		url: image.src,
		...getRenderedSize(image),
	} satisfies SyndicationImage;
}
