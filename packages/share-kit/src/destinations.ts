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
	withLinkCost,
	xLinkPattern,
} from './count.js';
import {
	shareKitLandscapeFormat,
	shareKitPinFormat,
	shareKitPortraitFormat,
	shareKitStoryFormat,
} from './formats.js';

export type ShareKitActionKind =
	'copy-caption' | 'open-composer' | 'save-image' | 'share-image' | 'share-link' | 'share-text';

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

export function defineShareKitDestination<const Id extends string, const Hint extends string>(
	destination: ShareKitDestination<Id> & { hint: Hint },
): ShareKitDestination<Id> & { hint: Hint };
export function defineShareKitDestination<const Id extends string>(
	destination: ShareKitDestination<Id>,
): ShareKitDestination<Id>;
export function defineShareKitDestination(destination: ShareKitDestination<string>) {
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
	hint: 'Facebook only takes the link. Your text is copied, so paste it into your post.',
	id: 'facebook',
	images: [shareKitLandscapeFormat, shareKitPortraitFormat],
	label: 'Facebook',
	limit: 63_206,
	shape: 'full',
} as const satisfies ShareKitDestination<'facebook'>;

export const shareKitInstagram = {
	actions: { desktop: ['save-image'], mobile: ['share-image'] },
	count: shareKitCountLength,
	hint: "Your text is copied, so paste it as the caption. Links in it aren't clickable.",
	id: 'instagram',
	images: [shareKitPortraitFormat],
	label: 'Instagram',
	limit: 2200,
	shape: 'text',
} as const satisfies ShareKitDestination<'instagram'>;

export const shareKitInstagramStory = {
	actions: { desktop: ['save-image'], mobile: ['share-image'] },
	count: shareKitCountLength,
	hint: 'The link is copied, so add it to your Story with a link sticker.',
	id: 'instagram-story',
	images: [shareKitStoryFormat, shareKitPortraitFormat],
	label: 'Story',
	shape: 'url',
} as const satisfies ShareKitDestination<'instagram-story'>;

export const shareKitLinkedin = {
	actions: { desktop: ['open-composer'], mobile: ['share-link', 'open-composer'] },
	composer: ({ url }) => withQuery('https://www.linkedin.com/sharing/share-offsite/', { url }),
	count: shareKitCountLength,
	hint: 'LinkedIn only takes the link. Your text is copied, so paste it into your post.',
	id: 'linkedin',
	images: [shareKitLandscapeFormat],
	label: 'LinkedIn',
	limit: 3000,
	shape: 'full',
} as const satisfies ShareKitDestination<'linkedin'>;

// LINE for PC ignores the `line.me/R` scheme, so a desktop gets the web share page instead
// Encoded by hand because nobody has checked whether LINE reads `+` as a space
export const shareKitLine = {
	actions: { desktop: ['open-composer'], mobile: ['open-composer'] },
	composer: ({ device, text, url }) =>
		device === 'mobile'
			? `https://line.me/R/share?text=${encodeURIComponent(text)}`
			: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
	count: shareKitCountLength,
	hint: 'Opens the LINE app if you have it, or LINE on the web, which asks you to sign in.',
	id: 'line',
	images: [shareKitLandscapeFormat],
	label: 'LINE',
	shape: 'full',
} as const satisfies ShareKitDestination<'line'>;

// The fragment keeps the text out of the hosted page's server logs
export const shareKitMastodon = {
	actions: { desktop: ['open-composer'], mobile: ['share-image', 'open-composer'] },
	composer: ({ text }) => `https://share.joinmastodon.org/#text=${encodeURIComponent(text)}`,
	count: shareKitWithLinkCost(shareKitCountStringz, fixedLinkCost),
	id: 'mastodon',
	images: [shareKitPortraitFormat],
	label: 'Mastodon',
	limit: 500,
	shape: 'full',
} as const satisfies ShareKitDestination<'mastodon'>;

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
	count: withLinkCost(shareKitCountWeighted, fixedLinkCost, xLinkPattern),
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
		case 'save-image': {
			return input.hasSuggestedImage;
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
