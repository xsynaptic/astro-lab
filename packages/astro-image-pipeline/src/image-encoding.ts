import type { AvifOptions, JpegOptions, PngOptions, WebpOptions } from 'sharp';

// Part of every render key; bump it when a render change alters the output bytes
export const imageRenderRevision = 3;

export interface ImageEncoding {
	avif?: AvifOptions;
	jpg?: JpegOptions;
	png?: PngOptions;
	webp?: WebpOptions;
}

export interface ResolvedImageEncoding {
	avif: AvifOptions;
	jpg: JpegOptions;
	png: PngOptions;
	webp: WebpOptions;
}

const encodingDefaults = {
	avif: { bitdepth: 8, chromaSubsampling: '4:4:4', effort: 4, quality: 50 },
	jpg: { mozjpeg: true, quality: 80 },
	png: { adaptiveFiltering: false, compressionLevel: 6, progressive: false },
	webp: { effort: 6, quality: 80 },
} as const satisfies ResolvedImageEncoding;

export function resolveImageEncoding(encoding: ImageEncoding = {}): ResolvedImageEncoding {
	return {
		avif: { ...encodingDefaults.avif, ...encoding.avif },
		jpg: { ...encodingDefaults.jpg, ...encoding.jpg },
		png: { ...encodingDefaults.png, ...encoding.png },
		webp: { ...encodingDefaults.webp, ...encoding.webp },
	};
}

export function serializeEncoding(options: ResolvedImageEncoding[keyof ResolvedImageEncoding]) {
	const entries = Object.entries(options).toSorted(([first], [second]) =>
		first.localeCompare(second),
	);

	return JSON.stringify(Object.fromEntries(entries));
}
