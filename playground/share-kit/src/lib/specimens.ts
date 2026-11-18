import type { ShareKitPayload } from '@xsynaptic/share-kit';

import type { Destination } from './destinations.js';

import { getSamplePayload, sampleSettings } from './sample-page.js';

// `data-can` stands in for the device, so each specimen opens the real dialog in one state
const capabilities = {
	desktop: 'copy-image',
	phone: 'files link mobile',
	phoneLinkOnly: 'link mobile',
} as const;

// Short sentences let each destination's fit land close to its limit, where composers show a number
const pasteTestSentences = [
	'The cat climbs the tower.',
	'貓爬上燈塔。',
	'Con mèo leo lên ngọn hải đăng.'.normalize('NFD'),
	'👨‍👩‍👧‍👦 A family waves from the shore.',
	'The beam sweeps the water.',
];

export interface Specimen {
	can?: string;
	class?: string;
	id: string;
	label: string;
	note: string;
	payload: ShareKitPayload<Destination>;
	triggers?: Array<{ destination: Destination; label: string }>;
}

export function getSpecimens(): Array<Specimen> {
	const payload = getSamplePayload();
	const cards = payload.assets.filter((asset) => asset.isSuggestable !== false);

	return [
		{
			id: 'this-device',
			label: 'This device',
			note: 'No data-can, so the dialog shows what this browser can actually do.',
			payload,
		},
		{
			can: capabilities.desktop,
			id: 'desktop',
			label: 'Desktop',
			note: 'Can copy images, and offers a QR code for opening the page on a phone. Add #share to the URL to open this one on load.',
			payload: { ...payload, settings: { ...sampleSettings, openHash: 'share' } },
		},
		{
			can: capabilities.desktop,
			id: 'named-triggers',
			label: 'Named triggers',
			note: 'Each extra button opens the same dialog with its destination selected.',
			payload,
			triggers: [
				{ destination: 'instagram', label: 'Share on Instagram' },
				{ destination: 'reddit', label: 'Share on Reddit' },
			],
		},
		{
			can: capabilities.desktop,
			id: 'single-destination',
			label: 'Single destination',
			note: 'Only Facebook, so there is no Post to row. Shares the #share hash with Desktop, which opens alone since it comes first.',
			payload: {
				...payload,
				settings: {
					...sampleSettings,
					destinations: ['facebook'],
					openHash: 'share',
				},
			},
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
			payload: { ...payload, assets: cards.filter((asset) => asset.id === 'landscape') },
		},
		{
			can: capabilities.desktop,
			id: 'failed-preview',
			label: 'Failed preview',
			note: 'The portrait card fails to load, so its tile is hidden and the next image is suggested instead.',
			payload: {
				...payload,
				assets: payload.assets.map((asset) =>
					asset.id === 'portrait'
						? { ...asset, previewSrc: `${asset.previewSrc}.missing`, src: `${asset.src}.missing` }
						: asset,
				),
			},
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
			id: 'paste-test',
			label: 'Paste test',
			note: 'CJK, decomposed Vietnamese and a family emoji in short sentences, so each caption fills close to its limit; compare the count here with each composer.',
			payload: {
				...payload,
				description: Array.from({ length: 16 }, () => pasteTestSentences.join(' ')).join(' '),
				title: `${'Người giữ hải đăng'.normalize('NFD')} 燈塔守護者 👨‍👩‍👧‍👦`,
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
