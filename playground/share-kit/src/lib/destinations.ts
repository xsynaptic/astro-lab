import type { ShareKitDestinationIdOf } from '@xsynaptic/share-kit';

import {
	defineShareKitDestination,
	shareKitAnywhere,
	shareKitBluesky,
	shareKitCountLength,
	shareKitFacebook,
	shareKitInstagram,
	shareKitInstagramStory,
	shareKitLandscapeFormat,
	shareKitLinkedin,
	shareKitMastodon,
	shareKitMessages,
	shareKitPinterest,
	shareKitReddit,
	shareKitThreads,
	shareKitX,
} from '@xsynaptic/share-kit';

// LINE's URL scheme isn't supported in LINE for PC, so a desktop gets the web share page instead
export const line = defineShareKitDestination({
	actions: { desktop: ['open-composer'], mobile: ['open-composer'] },
	composer: ({ device, text, url }) =>
		device === 'mobile'
			? `https://line.me/R/share?text=${encodeURIComponent(text)}`
			: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
	count: shareKitCountLength,
	id: 'line',
	images: [shareKitLandscapeFormat],
	label: 'LINE',
	shape: 'full',
});

// `URLSearchParams` would write spaces as `+`, which mail clients show literally
export const email = defineShareKitDestination({
	actions: { desktop: ['open-composer'], mobile: ['open-composer'] },
	composer: ({ text, title }) =>
		`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`,
	count: shareKitCountLength,
	id: 'email',
	images: [shareKitLandscapeFormat],
	label: 'Email',
	shape: 'full',
});

export const destinations = [
	shareKitAnywhere,
	shareKitBluesky,
	shareKitInstagram,
	shareKitInstagramStory,
	shareKitThreads,
	shareKitMastodon,
	shareKitX,
	shareKitFacebook,
	shareKitPinterest,
	shareKitReddit,
	shareKitLinkedin,
	shareKitMessages,
	line,
	email,
] as const;

export type Destination = ShareKitDestinationIdOf<typeof destinations>;
