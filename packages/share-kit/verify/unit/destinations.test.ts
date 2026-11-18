import { describe, expect, test } from 'vitest';

import type { ShareKitDestination, ShareKitDevice } from '../../src/destinations.js';

import { shareKitCountLength } from '../../src/count.js';
import {
	defineShareKitDestination,
	getPrimaryAction,
	shareKitAnywhere,
	shareKitBluesky,
	shareKitFacebook,
	shareKitLinkedin,
	shareKitMessages,
} from '../../src/destinations.js';
import { shareKitLandscapeFormat } from '../../src/formats.js';

interface Device {
	canShareFiles: boolean;
	canShareText: boolean;
	device: ShareKitDevice;
	hasSuggestedImage: boolean;
}

const phone: Device = {
	canShareFiles: true,
	canShareText: true,
	device: 'mobile',
	hasSuggestedImage: true,
};

const desktop: Device = {
	canShareFiles: false,
	canShareText: false,
	device: 'desktop',
	hasSuggestedImage: true,
};

function getAction(destination: ShareKitDestination<string>, { device, ...input }: Device) {
	const composerUrl = destination.composer?.({
		device,
		text: 'caption',
		title: 'title',
		url: 'https://example.com/',
	});

	return getPrimaryAction(destination.actions[device], { ...input, composerUrl });
}

const phoneOnly = defineShareKitDestination({
	actions: { desktop: ['open-composer'], mobile: ['open-composer'] },
	composer: ({ device, text }) =>
		device === 'mobile' ? `https://example.com/share?text=${encodeURIComponent(text)}` : undefined,
	count: shareKitCountLength,
	id: 'phone-only',
	images: [shareKitLandscapeFormat],
	label: 'Phone only',
	shape: 'full',
});

const composerless = defineShareKitDestination({
	actions: { desktop: ['open-composer', 'share-text'], mobile: ['open-composer'] },
	count: shareKitCountLength,
	id: 'composerless',
	images: [shareKitLandscapeFormat],
	label: 'Composerless',
	shape: 'full',
});

describe('primary action', () => {
	test('a phone hands a link-only destination to the share sheet, where its app is', () => {
		expect(getAction(shareKitFacebook, phone)).toBe('share-link');
		expect(getAction(shareKitLinkedin, phone)).toBe('share-link');
	});

	test('a desktop, or a phone without the share sheet, opens the web composer', () => {
		expect(getAction(shareKitFacebook, desktop)).toBe('open-composer');
		expect(getAction(shareKitFacebook, { ...phone, canShareText: false })).toBe('open-composer');
	});

	test('an image post on a phone shares the image, and opens the composer with none to suggest', () => {
		expect(getAction(shareKitBluesky, phone)).toBe('share-image');
		expect(getAction(shareKitBluesky, { ...phone, hasSuggestedImage: false })).toBe(
			'open-composer',
		);
	});

	test('a phone hands Anywhere to the share sheet; a desktop copies the caption', () => {
		expect(getAction(shareKitAnywhere, phone)).toBe('share-text');
		expect(getAction(shareKitAnywhere, desktop)).toBe('copy-caption');
	});

	test('a desktop hands Messages to the share sheet when it can share text', () => {
		expect(getAction(shareKitMessages, { ...desktop, canShareText: true })).toBe('share-text');
		expect(getAction(shareKitMessages, desktop)).toBe('copy-caption');
	});

	test('a composer that returns no URL for the device falls through to copying', () => {
		expect(getAction(phoneOnly, phone)).toBe('open-composer');
		expect(getAction(phoneOnly, desktop)).toBe('copy-caption');
	});

	test('a destination without a composer skips open-composer for the next action', () => {
		expect(getAction(composerless, { ...desktop, canShareText: true })).toBe('share-text');
		expect(getAction(composerless, phone)).toBe('copy-caption');
	});
});
