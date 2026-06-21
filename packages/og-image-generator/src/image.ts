import sharp from 'sharp';

import type { ImageFormat } from './renderer.js';

export type ImageInput = Buffer | string | Uint8Array;

export interface ResizeCoverOptions {
	height: number;
	position?: string;
	width: number;
}

export type SharpTransform = (pipeline: Sharp) => Sharp;

export interface ToDataUrlOptions {
	format?: ImageFormat;
	quality?: number;
}

type Sharp = ReturnType<typeof sharp>;

export function encodeDataUrl(buffer: Buffer, format: ImageFormat = 'jpeg'): string {
	return `data:image/${format};base64,${buffer.toString('base64')}`;
}

export function resizeCover(input: ImageInput, options: ResizeCoverOptions): Sharp {
	const { height, position = 'center', width } = options;

	return sharp(input).resize({ fit: 'cover', height, position, width });
}

export async function toDataUrl(pipeline: Sharp, options: ToDataUrlOptions = {}): Promise<string> {
	const { format = 'jpeg', quality = 90 } = options;
	const encoded = format === 'png' ? pipeline.png() : pipeline.jpeg({ quality });
	const { data, info } = await encoded.toBuffer({ resolveWithObject: true });

	return `data:image/${info.format};base64,${data.toString('base64')}`;
}
