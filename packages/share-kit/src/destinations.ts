import type { ShareCountRule } from './count.js';
import type { ShareKitAssetRole } from './types.js';

type ShareCaptionShape = 'full' | 'text' | 'title' | 'url';

interface ShareComposerInput {
	media: string | undefined;
	text: string;
	url: string;
}

export interface ShareDestination extends ShareCountRule {
	assetRole: Exclude<ShareKitAssetRole, 'photo'>;
	getComposerUrl?: (input: ShareComposerInput) => string | undefined;
	// The post is an image, so a phone hands the file to the share sheet rather than opening a composer
	isImagePost: boolean;
	isLinkOnly?: boolean;
	limit?: number;
	shape: ShareCaptionShape;
}

function withQuery(base: string, parameters: Record<string, string | undefined>) {
	const url = new URL(base);

	for (const [name, value] of Object.entries(parameters)) {
		if (value) url.searchParams.set(name, value);
	}

	return url.href;
}

export const shareDestinationAny = 'any';

export const shareDestinations = {
	bluesky: {
		assetRole: 'portrait',
		counter: 'graphemes',
		getComposerUrl: ({ text }) => withQuery('https://bsky.app/intent/compose', { text }),
		isImagePost: true,
		limit: 300,
		shape: 'full',
		urlCost: 'shortened',
	},
	facebook: {
		assetRole: 'landscape',
		counter: 'length',
		getComposerUrl: ({ url }) =>
			withQuery('https://www.facebook.com/sharer/sharer.php', { u: url }),
		isImagePost: false,
		isLinkOnly: true,
		limit: 63_206,
		shape: 'full',
		urlCost: 'actual',
	},
	instagram: {
		assetRole: 'portrait',
		counter: 'length',
		isImagePost: true,
		limit: 2200,
		shape: 'text',
		urlCost: 'actual',
	},
	'instagram-story': {
		assetRole: 'story',
		counter: 'length',
		isImagePost: true,
		shape: 'url',
		urlCost: 'actual',
	},
	linkedin: {
		assetRole: 'landscape',
		counter: 'length',
		getComposerUrl: ({ url }) =>
			withQuery('https://www.linkedin.com/sharing/share-offsite/', { url }),
		isImagePost: false,
		isLinkOnly: true,
		limit: 3000,
		shape: 'full',
		urlCost: 'actual',
	},
	// Each reader posts from their own server, so there is no composer to open
	mastodon: {
		assetRole: 'portrait',
		counter: 'stringz',
		isImagePost: true,
		limit: 500,
		shape: 'full',
		urlCost: 'fixed',
	},
	messages: {
		assetRole: 'landscape',
		counter: 'length',
		isImagePost: false,
		shape: 'full',
		urlCost: 'actual',
	},
	pinterest: {
		assetRole: 'portrait',
		counter: 'length',
		getComposerUrl: ({ media, text, url }) =>
			withQuery('https://www.pinterest.com/pin/create/button/', {
				description: text,
				media,
				url,
			}),
		isImagePost: false,
		limit: 800,
		shape: 'text',
		urlCost: 'actual',
	},
	reddit: {
		assetRole: 'landscape',
		counter: 'length',
		getComposerUrl: ({ text, url }) =>
			withQuery('https://www.reddit.com/submit', { title: text, url }),
		isImagePost: false,
		limit: 300,
		shape: 'title',
		urlCost: 'actual',
	},
	[shareDestinationAny]: {
		assetRole: 'landscape',
		counter: 'length',
		isImagePost: false,
		shape: 'full',
		urlCost: 'actual',
	},
	// Threads' docs give the limit in characters but count emoji in bytes; bytes is the reading that can't overshoot
	threads: {
		assetRole: 'portrait',
		counter: 'utf8',
		getComposerUrl: ({ text }) => withQuery('https://www.threads.com/intent/post', { text }),
		isImagePost: true,
		limit: 500,
		shape: 'full',
		urlCost: 'actual',
	},
	x: {
		assetRole: 'landscape',
		counter: 'weighted',
		getComposerUrl: ({ text }) => withQuery('https://x.com/intent/tweet', { text }),
		isImagePost: false,
		limit: 280,
		shape: 'full',
		urlCost: 'fixed',
	},
} as const satisfies Record<string, ShareDestination>;

export type ShareKitDestinationId = keyof typeof shareDestinations;

export function isShareDestinationId(id: string): id is ShareKitDestinationId {
	return Object.hasOwn(shareDestinations, id);
}

export function getShareDestination(id: ShareKitDestinationId): ShareDestination {
	return shareDestinations[id];
}

export function getDestinationUrl(
	url: string,
	id: ShareKitDestinationId,
	utmMedium: string | undefined,
) {
	if (!utmMedium || id === shareDestinationAny || !URL.canParse(url)) return url;

	return withQuery(url, { utm_medium: utmMedium, utm_source: id });
}

export type SharePrimaryAction =
	'copy-caption' | 'open-composer' | 'share-image' | 'share-link' | 'share-text';

interface SharePrimaryActionInput {
	canShareFiles: boolean;
	canShareText: boolean;
	hasComposerUrl: boolean;
	id: ShareKitDestinationId;
	isHandheld: boolean;
}

// A phone's share sheet reaches the platform's app, where the reader is signed in; its web composer often isn't
function getHandheldAction({
	canShareFiles,
	canShareText,
	id,
}: SharePrimaryActionInput): SharePrimaryAction | undefined {
	const { isImagePost, isLinkOnly } = getShareDestination(id);

	if (isImagePost && canShareFiles) return 'share-image';
	if (isLinkOnly === true && canShareText) return 'share-link';
	if (id === shareDestinationAny && canShareText) return 'share-text';

	return undefined;
}

export function getPrimaryAction(input: SharePrimaryActionInput): SharePrimaryAction {
	const handheldAction = input.isHandheld ? getHandheldAction(input) : undefined;

	if (handheldAction) return handheldAction;
	if (input.hasComposerUrl) return 'open-composer';
	if (input.id === 'messages' && input.canShareText) return 'share-text';

	return 'copy-caption';
}
