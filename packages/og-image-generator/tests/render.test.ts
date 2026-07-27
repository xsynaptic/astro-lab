import type { JSX as SatoriJsx } from 'satori/jsx';

import { createElement } from 'satori/jsx';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';

import { createOgRenderer, fontsourceFonts, resizeCover, toDataUrl } from '../src/index.js';

const loadFonts = () =>
	fontsourceFonts(
		[
			{
				name: 'Archivo',
				package: 'archivo',
				variants: [{ style: 'normal', subset: 'latin', weight: 800 }],
			},
		],
		{ resolveFrom: import.meta.url },
	);

const card = (text: string) =>
	createElement(
		'div',
		{
			style: {
				alignItems: 'center',
				background: '#efe2cd',
				color: '#2a201a',
				display: 'flex',
				fontFamily: 'Archivo',
				fontSize: 48,
				height: '100%',
				justifyContent: 'center',
				width: '100%',
			},
		},
		text,
	);

describe('createOgRenderer', () => {
	test('renders a valid JPEG at the requested dimensions', async () => {
		const render = createOgRenderer({ fonts: await loadFonts(), height: 315, width: 600 });

		const meta = await sharp(await render(card('Canary'))).metadata();

		expect(meta.format).toBe('jpeg');
		expect(meta.width).toBe(600);
		expect(meta.height).toBe(315);
	});

	test('renders PNG when requested', async () => {
		const render = createOgRenderer({
			fonts: await loadFonts(),
			format: 'png',
			height: 200,
			width: 200,
		});

		const meta = await sharp(await render(card('x'))).metadata();

		expect(meta.format).toBe('png');
	});

	test('renders WebP when requested', async () => {
		const render = createOgRenderer({
			fonts: await loadFonts(),
			format: 'webp',
			height: 200,
			width: 200,
		});

		const meta = await sharp(await render(card('x'))).metadata();

		expect(meta.format).toBe('webp');
	});

	test('rasterizes a WebP source image instead of dropping it', async () => {
		const source = await sharp({
			create: { background: { b: 40, g: 40, r: 200 }, channels: 3, height: 80, width: 80 },
		})
			.webp()
			.toBuffer();
		const src = await toDataUrl(resizeCover(source, { height: 80, width: 80 }));
		const render = createOgRenderer({ fonts: await loadFonts(), height: 80, width: 80 });
		const image: SatoriJsx.Element = createElement('img', { height: 80, src, width: 80 });

		const { data, info } = await sharp(
			await render(
				createElement('div', { style: { display: 'flex', height: '100%', width: '100%' } }, image),
			),
		)
			.raw()
			.toBuffer({ resolveWithObject: true });

		const centre = (info.width * 40 + 40) * info.channels;

		expect(data[centre]).toBeGreaterThan(150);
	});
});
