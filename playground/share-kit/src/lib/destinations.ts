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
	shareKitLine,
	shareKitLinkedin,
	shareKitMastodon,
	shareKitPinterest,
	shareKitReddit,
	shareKitThreads,
	shareKitX,
} from '@xsynaptic/share-kit';

// `URLSearchParams` would write spaces as `+`, which mail clients show literally
const email = defineShareKitDestination({
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
	shareKitLine,
	email,
] as const;

export type Destination = ShareKitDestinationIdOf<typeof destinations>;
