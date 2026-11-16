import { expect, expectTypeOf, test } from 'vitest';

import type { ShareKitDestination, ShareKitDestinationIdOf } from '../../src/destinations.js';
import type { ShareKitPayload, ShareKitSettings } from '../../src/types.js';

import { shareKitCountLength } from '../../src/count.js';
import {
	defineShareKitDestination,
	shareKitAnywhere,
	shareKitMastodon,
	shareKitThreads,
} from '../../src/destinations.js';
import { shareKitLandscapeFormat } from '../../src/formats.js';

// The checks are the compile; `pnpm check-types` fails if an expectation or an expected error breaks

const line = defineShareKitDestination({
	actions: { desktop: ['open-composer'], mobile: ['open-composer'] },
	composer: ({ text }) => `https://line.me/R/share?text=${encodeURIComponent(text)}`,
	count: shareKitCountLength,
	id: 'line',
	images: [shareKitLandscapeFormat],
	label: 'LINE',
	shape: 'full',
});

const destinations = [
	shareKitAnywhere,
	shareKitThreads,
	{ ...shareKitMastodon, limit: 1000 },
	line,
] as const;

type Destination = ShareKitDestinationIdOf<typeof destinations>;

test('ids come out as literals, spreads and custom definitions included', () => {
	expectTypeOf(destinations[3].id).toEqualTypeOf<'line'>();
	expectTypeOf<Destination>().toEqualTypeOf<'any' | 'line' | 'mastodon' | 'threads'>();
});

test('a typo in the settings fails, and a computed row is accepted', () => {
	const ids: ReadonlyArray<Destination> = ['any', 'line'];
	const settings: ShareKitSettings<Destination> = {
		destinations: ids.filter((id) => id !== 'any'),
		// @ts-expect-error `lnie` is not a registered id
		destinationsMore: ['lnie'],
	};

	expect(settings.destinations).toEqual(['line']);
});

test('the generics have no default for an id to widen to', () => {
	// @ts-expect-error `ShareKitDestination` needs its id parameter
	expectTypeOf<ShareKitDestination>().not.toBeAny();
	// @ts-expect-error `ShareKitPayload` needs its id parameter
	expectTypeOf<ShareKitPayload>().not.toBeAny();
});

test('a definition widened to `string` makes every id `never`', () => {
	expectTypeOf<
		ShareKitDestinationIdOf<readonly [typeof shareKitThreads, ShareKitDestination<string>]>
	>().toBeNever();
});
