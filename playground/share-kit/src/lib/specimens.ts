import type { ShareKitPayload } from '@xsynaptic/share-kit';

import { getSamplePayload, sampleSettings } from './sample-page.js';

// `data-can` stands in for the device, so each specimen opens the real dialog in one state
const capabilities = {
	desktop: 'copy-image',
	none: '',
	phone: 'files link handheld',
	phoneLinkOnly: 'link handheld',
} as const;

export interface Specimen {
	can?: string;
	class?: string;
	id: string;
	label: string;
	note: string;
	payload: ShareKitPayload;
}

export function getSpecimens(): Array<Specimen> {
	const payload = getSamplePayload();
	const cards = payload.assets.filter((asset) => asset.role !== 'photo');

	return [
		{
			can: capabilities.desktop,
			id: 'desktop',
			label: 'Desktop',
			note: 'Can copy images, and offers a QR code for opening the page on a phone. Add #share to the URL to open this one on load.',
			payload: { ...payload, settings: { ...sampleSettings, openHash: 'share' } },
		},
		{
			can: capabilities.phone,
			id: 'phone',
			label: 'Phone with file sharing',
			note: 'For image posts, the main button sends the suggested image to the share sheet. No QR code.',
			payload,
		},
		{
			can: capabilities.phoneLinkOnly,
			id: 'phone-link-only',
			label: 'Phone, link sharing only',
			note: 'The share sheet takes links but not files, like Firefox on Android.',
			payload,
		},
		{
			can: capabilities.desktop,
			id: 'landscape-only',
			label: 'Landscape card only',
			note: 'A page with no photos to offer.',
			payload: { ...payload, assets: cards.filter((asset) => asset.role === 'landscape') },
		},
		{
			can: capabilities.desktop,
			id: 'failed-preview',
			label: 'Failed preview',
			note: 'The portrait card fails to load, so its tile is hidden and the next image is suggested instead.',
			payload: {
				...payload,
				assets: payload.assets.map((asset) =>
					asset.role === 'portrait'
						? { ...asset, previewSrc: `${asset.previewSrc}.missing`, src: `${asset.src}.missing` }
						: asset,
				),
			},
		},
		{
			can: capabilities.desktop,
			id: 'no-photos',
			label: 'No photos',
			note: 'Only the three cards.',
			payload: { ...payload, assets: cards },
		},
		{
			can: capabilities.none,
			id: 'no-sharing',
			label: 'No sharing or image clipboard',
			note: 'Images can only be saved.',
			payload,
		},
		{
			can: capabilities.desktop,
			id: 'long-cjk-title',
			label: 'Long CJK title',
			note: 'X counts each Chinese character twice, so its caption gets much shorter.',
			payload: {
				...payload,
				description: '霧夜裡，守塔人爬上燈塔修剪燈芯，貓也跟著爬上去。'.repeat(12),
				locale: 'zh-TW',
				title: '燈塔守護者的貓：在霧夜裡陪伴守塔人爬上塔頂看著光束掃過海面的故事',
			},
		},
		{
			can: capabilities.desktop,
			id: 'thai-description',
			label: 'Thai description',
			note: 'Thai has no spaces between words, so the caption is cut at word boundaries the browser finds.',
			payload: {
				...payload,
				description: 'เรือใบลำเล็กแล่นผ่านประภาคารริมทะเลในยามเช้าขณะที่แมวนั่งมองอยู่ริมหน้าต่าง'.repeat(8),
				locale: 'th',
				title: 'แมวของผู้ดูแลประภาคาร',
			},
		},
		{
			can: capabilities.desktop,
			id: 'over-limit',
			label: 'Caption over the limit',
			note: 'The link alone is longer than Threads allows, so the count turns red and a screen reader hears a warning.',
			payload: {
				...payload,
				settings: { ...sampleSettings, destinations: ['threads', 'x', 'bluesky'] },
				url: `https://example.com/${'a-very-long-path-segment/'.repeat(24)}`,
			},
		},
		{
			can: capabilities.desktop,
			class: 'retheme',
			id: 'retheme',
			label: 'Custom theme',
			note: 'Sets its own --share-kit-* colours and radius, and rounds the main button with a class passed in classNames.',
			payload: {
				...payload,
				settings: { ...sampleSettings, classNames: { primary: 'pill' } },
			},
		},
	];
}
