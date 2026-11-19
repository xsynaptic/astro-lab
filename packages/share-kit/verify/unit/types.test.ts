import { expect, expectTypeOf, test } from 'vitest';

import type {
	ShareKitDestination,
	ShareKitDestinationIdOf,
	shareKitLine,
} from '../../src/destinations.js';
import type {
	ShareKitDestinationHintKey,
	ShareKitDestinationStringKey,
} from '../../src/strings.js';
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

const email = defineShareKitDestination({
	actions: { desktop: ['open-composer'], mobile: ['open-composer'] },
	composer: ({ text }) => `mailto:?body=${encodeURIComponent(text)}`,
	count: shareKitCountLength,
	id: 'email',
	images: [shareKitLandscapeFormat],
	label: 'Email',
	shape: 'full',
});

const destinations = [
	shareKitAnywhere,
	shareKitThreads,
	{ ...shareKitMastodon, limit: 1000 },
	email,
] as const;

type Destination = ShareKitDestinationIdOf<typeof destinations>;

test('ids come out as literals, spreads and custom definitions included', () => {
	expectTypeOf(destinations[3].id).toEqualTypeOf<'email'>();
	expectTypeOf<Destination>().toEqualTypeOf<'any' | 'email' | 'mastodon' | 'threads'>();
});

test('a typo in the settings fails, and a computed row is accepted', () => {
	const ids: ReadonlyArray<Destination> = ['any', 'email'];
	const settings: ShareKitSettings<Destination> = {
		destinations: ids.filter((id) => id !== 'any'),
	};
	const typo: ShareKitSettings<Destination> = {
		// @ts-expect-error `emial` is not a registered id
		destinations: ['emial'],
	};

	expect(settings.destinations).toEqual(['email']);
	expect(typo.destinations).toEqual(['emial']);
});

test('destination string keys include a hint only where the destination has one', () => {
	const sms = defineShareKitDestination({ ...email, hint: 'Opens your messages app.', id: 'sms' });
	type Destinations = readonly [
		typeof shareKitAnywhere,
		typeof shareKitLine,
		typeof email,
		typeof sms,
	];

	expectTypeOf(sms.hint).toEqualTypeOf<'Opens your messages app.'>();
	expectTypeOf<ShareKitDestinationHintKey<Destinations>>().toEqualTypeOf<
		'hint.line' | 'hint.sms'
	>();
	expectTypeOf<ShareKitDestinationStringKey<Destinations>>().toEqualTypeOf<
		| 'destination.any'
		| 'destination.email'
		| 'destination.line'
		| 'destination.sms'
		| 'hint.line'
		| 'hint.sms'
	>();
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
