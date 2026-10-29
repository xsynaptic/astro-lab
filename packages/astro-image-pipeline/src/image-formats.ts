export const imageFormats = ['jpg', 'webp', 'png', 'avif'] as const;

export type ImageFormat = (typeof imageFormats)[number];

interface ImageFormatTraits {
	canAnimate: boolean;
	contentType: string;
	keepsAlpha: boolean;
}

export const imageFormatTraits = {
	avif: { canAnimate: false, contentType: 'image/avif', keepsAlpha: true },
	jpg: { canAnimate: false, contentType: 'image/jpeg', keepsAlpha: false },
	png: { canAnimate: false, contentType: 'image/png', keepsAlpha: true },
	webp: { canAnimate: true, contentType: 'image/webp', keepsAlpha: true },
} as const satisfies Record<ImageFormat, ImageFormatTraits>;

export function isImageFormat(value: string | undefined): value is ImageFormat {
	return (imageFormats as ReadonlyArray<string | undefined>).includes(value);
}
