import { describe, expect, test } from 'vitest';

import type { ShareKitDestinationId } from '../../src/destinations.js';

import { getSpecimens } from '../../../../playground/share-kit/src/lib/specimens.js';
import { fitCaption } from '../../src/caption.js';
import { getDestinationUrl } from '../../src/destinations.js';
import { countLikeBluesky, countLikeMastodon, countLikeX } from './reference-counters.js';

function getPasteTestCaption(id: ShareKitDestinationId) {
	const specimen = getSpecimens().find((candidate) => candidate.id === 'paste-test');

	if (!specimen) throw new Error('The playground has no "paste-test" specimen');

	const { description, locale, settings, title, url } = specimen.payload;

	return fitCaption(
		{ description, title, url: getDestinationUrl(url, id, settings.utmMedium) },
		id,
		locale,
	);
}

describe('the paste test specimen', () => {
	test.each([
		['x', countLikeX],
		['bluesky', countLikeBluesky],
		['mastodon', countLikeMastodon],
	] as const)('%s counts its caption as its composer does', (id, countLikeComposer) => {
		const { count, limit, text } = getPasteTestCaption(id);

		expect(count).toBe(countLikeComposer(text));
		expect(count).toBeLessThanOrEqual(limit ?? Infinity);
	});
});
