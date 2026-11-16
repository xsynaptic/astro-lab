import { describe, expect, test } from 'vitest';

import {
	shareKitBluesky,
	shareKitInstagram,
	shareKitInstagramStory,
	shareKitPinterest,
	shareKitX,
} from '../../src/destinations.js';
import {
	getShareKitImageFormats,
	getSuggestedImage,
	shareKitLandscapeFormat,
	shareKitPortraitFormat,
	shareKitStoryFormat,
} from '../../src/formats.js';

const landscape = { ...shareKitLandscapeFormat };

const portrait = { ...shareKitPortraitFormat };

const story = { ...shareKitStoryFormat };

describe('getSuggestedImage', () => {
	test("Pinterest falls back along its list to portrait, though story's ratio is nearer 2:3", () => {
		expect(getSuggestedImage([landscape, story, portrait], shareKitPinterest.images)).toBe(
			portrait,
		);
	});

	test('a format a few pixels off still fits, and one 3% off does not', () => {
		const offByAFew = { height: 1356, id: 'portrait-ish', width: 1080 };
		const pinIsh = { height: 1545, id: 'pin-ish', width: 1000 };

		expect(getSuggestedImage([landscape, offByAFew], shareKitBluesky.images)).toBe(offByAFew);
		expect(getSuggestedImage([pinIsh, portrait], shareKitPinterest.images)).toBe(portrait);
	});

	test('a landscape-only page suggests its one card everywhere', () => {
		expect(getSuggestedImage([landscape], shareKitBluesky.images)).toBe(landscape);
		expect(getSuggestedImage([landscape], shareKitInstagramStory.images)).toBe(landscape);
	});

	test('with nothing fitting, the image nearest the first format wins, the earlier on a tie', () => {
		const square = { height: 1000, id: 'square', width: 1000 };
		const squareAgain = { ...square, id: 'square-2' };

		expect(getSuggestedImage([landscape, square, squareAgain], shareKitBluesky.images)).toBe(
			square,
		);
	});

	test('the fallback measures against the first format only', () => {
		const nearPortrait = { height: 1000, id: 'near-portrait', width: 850 };
		const nearPin = { height: 1000, id: 'near-pin', width: 600 };

		expect(getSuggestedImage([nearPortrait, nearPin], shareKitPinterest.images)).toBe(nearPin);
	});

	test('an image without dimensions never wins the fallback', () => {
		const broken = { id: 'broken' } as unknown as typeof landscape;

		expect(getSuggestedImage([landscape, broken], shareKitBluesky.images)).toBe(landscape);
	});

	test('a photo is never suggested, even in the exact format', () => {
		const photo = { ...shareKitPortraitFormat, id: 'photo-1', isSuggestable: false };

		expect(getSuggestedImage([photo, landscape], shareKitInstagram.images)).toBe(landscape);
	});

	test('with every card failed, nothing is suggested', () => {
		const photo = { ...shareKitPortraitFormat, id: 'photo-1', isSuggestable: false };

		expect(getSuggestedImage([], shareKitX.images)).toBeUndefined();
		expect(getSuggestedImage([photo], shareKitX.images)).toBeUndefined();
	});

	test('two images in the same format go by payload order', () => {
		const second = { ...shareKitPortraitFormat, id: 'portrait-2' };

		expect(getSuggestedImage([portrait, second], shareKitBluesky.images)).toBe(portrait);
	});
});

describe('getShareKitImageFormats', () => {
	test("returns each destination's ideal once, in the order first asked for", () => {
		expect(
			getShareKitImageFormats([
				shareKitInstagram,
				shareKitInstagramStory,
				shareKitBluesky,
				shareKitPinterest,
				shareKitX,
			]).map(({ id }) => id),
		).toEqual(['portrait', 'story', 'pin', 'landscape']);
	});
});
