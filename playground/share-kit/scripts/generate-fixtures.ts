import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { render } from 'takumi-js';

// Output is committed; drawing it here means no licence to track
// The cards stand in for pipeline cards until it can draw them in dev (image-pipeline-dev-cards.md)

const mediaDirectory = new URL('../media/', import.meta.url);

const cardsDirectory = new URL('../public/cards/', import.meta.url);

const sampleTitle = "The Lighthouse Keeper's Cat";

const sampleDomain = 'example.com';

interface Photo {
	from: string;
	height: number;
	name: string;
	to: string;
	width: number;
}

const photos: Array<Photo> = [
	{ from: '#14213d', height: 1333, name: 'sea-at-dusk.jpg', to: '#e07a5f', width: 2000 },
	{ from: '#0b3d4f', height: 1875, name: 'lighthouse-tower.jpg', to: '#8ecae6', width: 1500 },
];

interface Card {
	height: number;
	titleSize: number;
	variant: 'landscape' | 'portrait' | 'story';
	width: number;
}

const cards: Array<Card> = [
	{ height: 630, titleSize: 72, variant: 'landscape', width: 1200 },
	{ height: 1350, titleSize: 96, variant: 'portrait', width: 1080 },
	{ height: 1920, titleSize: 112, variant: 'story', width: 1080 },
];

function getPhotoSvg({ from, height, to, width }: Photo) {
	const radius = Math.round(Math.min(width, height) / 5);

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">
		<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
		<rect width="100%" height="100%" fill="url(#sky)"/>
		<circle cx="${String(Math.round(width * 0.7))}" cy="${String(Math.round(height * 0.35))}" r="${String(radius)}" fill="#f5e6c8" opacity="0.6"/>
		<rect y="${String(Math.round(height * 0.72))}" width="100%" height="${String(Math.round(height * 0.28))}" fill="#1b1b1b" opacity="0.55"/>
	</svg>`;
}

function getCardHtml({ titleSize, variant }: Card) {
	return `<div style="display: flex; flex-direction: column; justify-content: space-between; width: 100%; height: 100%; padding: 72px; background-image: linear-gradient(160deg, #0b3d4f, #2a9d8f); color: #fff;">
		<div style="display: flex; font-size: 32px; letter-spacing: 4px; text-transform: uppercase; opacity: 0.8;">${variant} card</div>
		<div style="display: flex; flex-direction: column; gap: 24px;">
			<div style="display: flex; font-size: ${String(titleSize)}px; font-weight: 700; line-height: 1.1;">${sampleTitle}</div>
			<div style="display: flex; font-size: 32px; opacity: 0.8;">${sampleDomain}</div>
		</div>
	</div>`;
}

async function writePhoto(photo: Photo) {
	const data = await sharp(Buffer.from(getPhotoSvg(photo)))
		.jpeg({ mozjpeg: true, quality: 80 })
		.toBuffer();

	await writeFile(new URL(photo.name, mediaDirectory), data);
}

async function writeCard(card: Card) {
	const data = await render(getCardHtml(card), {
		format: 'jpeg',
		height: card.height,
		quality: 85,
		width: card.width,
	});

	await writeFile(new URL(`lighthouse-cat-${card.variant}.jpg`, cardsDirectory), data);
}

await mkdir(mediaDirectory, { recursive: true });
await mkdir(cardsDirectory, { recursive: true });
await Promise.all([...photos.map(writePhoto), ...cards.map(writeCard)]);

console.log(
	`Wrote ${String(photos.length)} photos to ${fileURLToPath(mediaDirectory)} and ${String(cards.length)} cards to ${fileURLToPath(cardsDirectory)}`,
);
