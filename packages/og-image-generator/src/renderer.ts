import type { Font } from 'satori';
import type { JSXNode, JSX as SatoriJsx } from 'satori/jsx';

import satori from 'satori';
import sharp from 'sharp';

export type ImageFormat = 'jpeg' | 'png';

// Typed via satori/jsx so the engine needs no React types
// The union also accepts createElement output, which does not widen to JSXNode
export type OgElement = JSXNode | SatoriJsx.Element;

export type OgRenderer = (element: OgElement) => Promise<Buffer>;

export interface OgRendererOptions {
	fonts: Array<Font>;
	format?: ImageFormat;
	height: number;
	quality?: number;
	width: number;
}

// Create once and reuse: font parsing and Yoga init are expensive
export function createOgRenderer(options: OgRendererOptions): OgRenderer {
	const { fonts, format = 'jpeg', height, quality = 90, width } = options;

	return async function render(element: OgElement): Promise<Buffer> {
		const svg = await satori(element, { fonts, height, width });
		const image = sharp(Buffer.from(svg), { failOn: 'error' });

		if (format === 'png') return image.png().toBuffer();

		return image.jpeg({ quality }).toBuffer();
	};
}
