export const imageFormats = ['jpg', 'webp'] as const;

export type ImageFormat = (typeof imageFormats)[number];

export interface ImageSize {
	height?: number;
	width: number;
}

export interface RenditionSize extends ImageSize {
	format: ImageFormat;
}

export interface RenditionName extends RenditionSize {
	stem: string;
}

const imageNameTerminators = String.raw`\s"'&<>),`;

const imageNamePatternSource = String.raw`(?<stem>[^${imageNameTerminators}]+?)-(?<width>[1-9]\d*)(?:x(?<height>[1-9]\d*))?\.(?<format>${imageFormats.join('|')})`;

const imageNamePattern = new RegExp(`^${imageNamePatternSource}$`);

const imageStemPattern = new RegExp(`^[^${imageNameTerminators}]+$`);

const unsafeSegments = new Set(['', '.', '..']);

const sourcePattern = /\.(?:avif|gif|jpe?g|png|webp)$/i;

function isFormat(value: string | undefined): value is ImageFormat {
	return (imageFormats as ReadonlyArray<string | undefined>).includes(value);
}

function isSafeStem(stem: string) {
	return stem.split('/').every((segment) => !unsafeSegments.has(segment));
}

export function isImageSource(path: string) {
	return sourcePattern.test(path);
}

export function getImageStem(id: string) {
	return id.replace(/\.[^./]+$/, '');
}

export function isImageStem(stem: string) {
	return imageStemPattern.test(stem) && isSafeStem(stem);
}

// Names drop the extension, so a.jpg and a.png (or A.png on a case-insensitive disk) would collide
export function findStemCollisions(ids: Iterable<string>) {
	const idsByStem = Map.groupBy(ids, (id) => getImageStem(id).toLowerCase());

	return [...idsByStem.values()]
		.filter((stemIds) => stemIds.length > 1)
		.map((stemIds) => stemIds.toSorted((first, second) => first.localeCompare(second)));
}

export function formatRenditionName({ format, height, stem, width }: RenditionName) {
	const size = height === undefined ? String(width) : `${String(width)}x${String(height)}`;

	return `${stem}-${size}.${format}`;
}

export function parseRenditionName(name: string): RenditionName | undefined {
	const { format, height, stem, width } = imageNamePattern.exec(name)?.groups ?? {};

	if (stem === undefined || width === undefined || !isFormat(format) || !isSafeStem(stem)) return;

	const parsed: RenditionName = { format, stem, width: Number(width) };

	if (height !== undefined) parsed.height = Number(height);

	return parsed;
}
