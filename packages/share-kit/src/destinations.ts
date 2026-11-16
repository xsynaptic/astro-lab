import type { ShareKitCounter } from './count.js';
import type { ShareKitImageFormats } from './formats.js';

import {
	shareKitCountGraphemes,
	shareKitCountLength,
	shareKitCountStringz,
	shareKitCountUtf8,
	shareKitCountWeighted,
	shareKitShortenedLinkCost,
	shareKitWithLinkCost,
} from './count.js';
import {
	shareKitLandscapeFormat,
	shareKitPinFormat,
	shareKitPortraitFormat,
	shareKitStoryFormat,
} from './formats.js';

export type ShareKitActionKind =
	'copy-caption' | 'open-composer' | 'share-image' | 'share-link' | 'share-text';

export type ShareKitDevice = 'desktop' | 'mobile';

export interface ShareKitComposerInput {
	description?: string;
	device: ShareKitDevice;
	media?: string;
	text: string;
	title: string;
	url: string;
}

export interface ShareKitDestination<Id extends string> {
	actions: Record<ShareKitDevice, ReadonlyArray<ShareKitActionKind>>;
	composer?: (input: ShareKitComposerInput) => string | undefined;
	count: ShareKitCounter;
	hint?: string;
	id: Id;
	images: ShareKitImageFormats;
	label: string;
	limit?: number;
	shape: 'full' | 'text' | 'title' | 'url';
	utmSource?: false | string;
}

export function defineShareKitDestination<const Id extends string>(
	destination: ShareKitDestination<Id>,
) {
	return destination;
}

// A definition that widened its id to `string` would accept any id, so it accepts none instead
export type ShareKitDestinationIdOf<
	Destinations extends ReadonlyArray<ShareKitDestination<string>>,
> = Destinations[number]['id'] extends infer Id extends string
	? string extends Id
		? never
		: Id
	: never;

function withQuery(base: string, parameters: Record<string, string | undefined>) {
	const url = new URL(base);

	for (const [name, value] of Object.entries(parameters)) {
		if (value) url.searchParams.set(name, value);
	}

	return url.href;
}

// X and Mastodon both charge 23 for any link, whatever its length
const fixedLinkCost = 23;

export const shareKitAnywhere = {
	actions: { desktop: [], mobile: ['share-text'] },
	count: shareKitCountLength,
	id: 'any',
	images: [shareKitLandscapeFormat],
	label: 'Anywhere',
	shape: 'full',
	utmSource: false,
} as const satisfies ShareKitDestination<'any'>;

export const shareKitBluesky = {
	actions: { desktop: ['open-composer'], mobile: ['share-image', 'open-composer'] },
	composer: ({ text }) => withQuery('https://bsky.app/intent/compose', { text }),
	count: shareKitWithLinkCost(shareKitCountGraphemes, shareKitShortenedLinkCost),
	id: 'bluesky',
	images: [shareKitPortraitFormat],
	label: 'Bluesky',
	limit: 300,
	shape: 'full',
} as const satisfies ShareKitDestination<'bluesky'>;

export const shareKitFacebook = {
	actions: { desktop: ['open-composer'], mobile: ['share-link', 'open-composer'] },
	composer: ({ url }) => withQuery('https://www.facebook.com/sharer/sharer.php', { u: url }),
	count: shareKitCountLength,
	hint: 'Facebook only takes the link. Your caption is copied, so paste it into your post.',
	id: 'facebook',
	images: [shareKitLandscapeFormat, shareKitPortraitFormat],
	label: 'Facebook',
	limit: 63_206,
	shape: 'full',
} as const satisfies ShareKitDestination<'facebook'>;

export const shareKitInstagram = {
	actions: { desktop: [], mobile: ['share-image'] },
	count: shareKitCountLength,
	hint: "Links in Instagram captions aren't clickable. Point people to the link in your bio.",
	id: 'instagram',
	images: [shareKitPortraitFormat],
	label: 'Instagram',
	limit: 2200,
	shape: 'text',
} as const satisfies ShareKitDestination<'instagram'>;

export const shareKitInstagramStory = {
	actions: { desktop: [], mobile: ['share-image'] },
	count: shareKitCountLength,
	hint: 'Add the link to your Story with a link sticker.',
	id: 'instagram-story',
	images: [shareKitStoryFormat, shareKitPortraitFormat],
	label: 'Story',
	shape: 'url',
} as const satisfies ShareKitDestination<'instagram-story'>;

export const shareKitLinkedin = {
	actions: { desktop: ['open-composer'], mobile: ['share-link', 'open-composer'] },
	composer: ({ url }) => withQuery('https://www.linkedin.com/sharing/share-offsite/', { url }),
	count: shareKitCountLength,
	hint: 'LinkedIn only takes the link. Your caption is copied, so paste it into your post.',
	id: 'linkedin',
	images: [shareKitLandscapeFormat],
	label: 'LinkedIn',
	limit: 3000,
	shape: 'full',
} as const satisfies ShareKitDestination<'linkedin'>;

// Each reader posts from their own server, so there is no composer to open
export const shareKitMastodon = {
	actions: { desktop: [], mobile: ['share-image'] },
	count: shareKitWithLinkCost(shareKitCountStringz, fixedLinkCost),
	id: 'mastodon',
	images: [shareKitPortraitFormat],
	label: 'Mastodon',
	limit: 500,
	shape: 'full',
} as const satisfies ShareKitDestination<'mastodon'>;

export const shareKitMessages = {
	actions: { desktop: ['share-text'], mobile: ['share-text'] },
	count: shareKitCountLength,
	id: 'messages',
	images: [shareKitLandscapeFormat],
	label: 'Messages',
	shape: 'full',
} as const satisfies ShareKitDestination<'messages'>;

export const shareKitPinterest = {
	actions: { desktop: ['open-composer'], mobile: ['open-composer'] },
	composer: ({ media, text, url }) =>
		withQuery('https://www.pinterest.com/pin/create/button/', { description: text, media, url }),
	count: shareKitCountLength,
	id: 'pinterest',
	images: [shareKitPinFormat, shareKitPortraitFormat],
	label: 'Pinterest',
	limit: 800,
	shape: 'text',
} as const satisfies ShareKitDestination<'pinterest'>;

export const shareKitReddit = {
	actions: { desktop: ['open-composer'], mobile: ['open-composer'] },
	composer: ({ text, url }) => withQuery('https://www.reddit.com/submit', { title: text, url }),
	count: shareKitCountLength,
	hint: 'Reddit takes a title and the link.',
	id: 'reddit',
	images: [shareKitLandscapeFormat],
	label: 'Reddit',
	limit: 300,
	shape: 'title',
} as const satisfies ShareKitDestination<'reddit'>;

// Threads' docs give the limit in characters but count emoji in bytes; bytes is the reading that can't overshoot
export const shareKitThreads = {
	actions: { desktop: ['open-composer'], mobile: ['share-image', 'open-composer'] },
	composer: ({ text }) => withQuery('https://www.threads.com/intent/post', { text }),
	count: shareKitCountUtf8,
	id: 'threads',
	images: [shareKitPortraitFormat],
	label: 'Threads',
	limit: 500,
	shape: 'full',
} as const satisfies ShareKitDestination<'threads'>;

export const shareKitX = {
	actions: { desktop: ['open-composer'], mobile: ['open-composer'] },
	composer: ({ text }) => withQuery('https://x.com/intent/tweet', { text }),
	count: shareKitWithLinkCost(shareKitCountWeighted, fixedLinkCost),
	id: 'x',
	images: [shareKitLandscapeFormat, shareKitPortraitFormat],
	label: 'X',
	limit: 280,
	shape: 'full',
} as const satisfies ShareKitDestination<'x'>;

export function getDestinationUrl(
	url: string,
	{ id, utmSource = id }: Pick<ShareKitDestination<string>, 'id' | 'utmSource'>,
	utmMedium: string | undefined,
) {
	if (!utmMedium || utmSource === false || !URL.canParse(url)) return url;

	return withQuery(url, { utm_medium: utmMedium, utm_source: utmSource });
}

interface SharePrimaryActionInput {
	canShareFiles: boolean;
	canShareText: boolean;
	composerUrl: string | undefined;
	hasSuggestedImage: boolean;
}

function canRun(action: ShareKitActionKind, input: SharePrimaryActionInput) {
	switch (action) {
		case 'copy-caption': {
			return true;
		}
		case 'open-composer': {
			return Boolean(input.composerUrl);
		}
		case 'share-image': {
			return input.canShareFiles && input.hasSuggestedImage;
		}
		case 'share-link':
		case 'share-text': {
			return input.canShareText;
		}
	}
}

export function getPrimaryAction(
	actions: ReadonlyArray<ShareKitActionKind>,
	input: SharePrimaryActionInput,
): ShareKitActionKind {
	return actions.find((action) => canRun(action, input)) ?? 'copy-caption';
}
