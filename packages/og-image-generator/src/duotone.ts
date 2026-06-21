import type { SharpTransform } from './image.js';

// Map luminance onto two inks
// Modulate (not greyscale) keeps the three channels the per-channel linear map needs
export function createDuotone(dark: string, light: string): SharpTransform {
	const [darkR, darkG, darkB] = hexToRgb(dark);
	const [lightR, lightG, lightB] = hexToRgb(light);
	const slope = [(lightR - darkR) / 255, (lightG - darkG) / 255, (lightB - darkB) / 255];
	const intercept = [darkR, darkG, darkB];

	return (pipeline) => pipeline.modulate({ saturation: 0 }).linear(slope, intercept);
}

function hexToRgb(hex: string): [number, number, number] {
	const value = hex.replace('#', '');
	const full =
		value.length === 3
			? value
					.split('')
					.map((channel) => channel + channel)
					.join('')
			: value;
	const int = Number.parseInt(full, 16);

	return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}
