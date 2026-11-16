import { describe, expect, test } from 'vitest';

import type { ShareKitDestination } from '../../src/destinations.js';

import { getSpecimens } from '../../../../playground/share-kit/src/lib/specimens.js';
import { fitCaption } from '../../src/caption.js';
import {
	getDestinationUrl,
	shareKitBluesky,
	shareKitMastodon,
	shareKitX,
} from '../../src/destinations.js';
import { countLikeBluesky, countLikeMastodon, countLikeX } from './reference-counters.js';

function getPasteTestCaption(destination: ShareKitDestination<string>) {
	const specimen = getSpecimens().find((candidate) => candidate.id === 'paste-test');

	if (!specimen) throw new Error('The playground has no "paste-test" specimen');

	const { description, locale, settings, title, url } = specimen.payload;

	return fitCaption(
		{ description, title, url: getDestinationUrl(url, destination, settings.utmMedium) },
		destination,
		locale,
	);
}

describe('the paste test specimen', () => {
	test.each([
		['X', shareKitX, countLikeX],
		['Bluesky', shareKitBluesky, countLikeBluesky],
		['Mastodon', shareKitMastodon, countLikeMastodon],
	] as const)(
		'%s counts its caption as its composer does',
		(_label, destination, countLikeComposer) => {
			const { count, limit, text } = getPasteTestCaption(destination);

			expect(count).toBe(countLikeComposer(text));
			expect(count).toBeLessThanOrEqual(limit ?? Infinity);
		},
	);
});
