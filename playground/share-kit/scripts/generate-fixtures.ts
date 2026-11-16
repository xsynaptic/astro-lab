import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Output is committed; drawing it here means no licence to track

const mediaDirectory = new URL('../media/', import.meta.url);

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

function getPhotoSvg({ from, height, to, width }: Photo) {
	const radius = Math.round(Math.min(width, height) / 5);

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">
		<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
		<rect width="100%" height="100%" fill="url(#sky)"/>
		<circle cx="${String(Math.round(width * 0.7))}" cy="${String(Math.round(height * 0.35))}" r="${String(radius)}" fill="#f5e6c8" opacity="0.6"/>
		<rect y="${String(Math.round(height * 0.72))}" width="100%" height="${String(Math.round(height * 0.28))}" fill="#1b1b1b" opacity="0.55"/>
	</svg>`;
}

async function writePhoto(photo: Photo) {
	const data = await sharp(Buffer.from(getPhotoSvg(photo)))
		.jpeg({ mozjpeg: true, quality: 80 })
		.toBuffer();

	await writeFile(new URL(photo.name, mediaDirectory), data);
}

await mkdir(mediaDirectory, { recursive: true });
await Promise.all(photos.map(writePhoto));

console.log(`Wrote ${String(photos.length)} photos to ${fileURLToPath(mediaDirectory)}`);
