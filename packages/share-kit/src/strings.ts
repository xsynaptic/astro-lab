export const shareKitStringDefaults = {
	assetCopy: 'Copy',
	assetSave: 'Save',
	assetShare: 'Share',
	captionCopy: 'Copy caption',
	captionOver: '{count} over the limit for {destination}',
	captionReset: 'Reset',
	captionTitle: 'Caption',
	close: 'Close',
	copied: 'Copied',
	copyManual: "Couldn't copy. The caption is selected, so you can copy it yourself.",
	'destination.any': 'Anywhere',
	'destination.bluesky': 'Bluesky',
	'destination.facebook': 'Facebook',
	'destination.instagram': 'Instagram',
	'destination.instagram-story': 'Story',
	'destination.linkedin': 'LinkedIn',
	'destination.mastodon': 'Mastodon',
	'destination.messages': 'Messages',
	'destination.pinterest': 'Pinterest',
	'destination.reddit': 'Reddit',
	'destination.threads': 'Threads',
	'destination.x': 'X',
	destinationsMore: 'More',
	destinationsTitle: 'Post to',
	error: 'Something went wrong. Try saving instead.',
	'hint.facebook':
		'Facebook only takes the link. Your caption is copied, so paste it into your post.',
	'hint.instagram':
		"Links in Instagram captions aren't clickable. Point people to the link in your bio.",
	'hint.instagram-story': 'Add the link to your Story with a link sticker.',
	'hint.linkedin':
		'LinkedIn only takes the link. Your caption is copied, so paste it into your post.',
	'hint.reddit': 'Reddit takes a title and the link.',
	imagesTitle: 'Images',
	linkCopy: 'Copy link',
	linkTitle: 'Link',
	primaryCopy: 'Copy caption',
	primaryOpen: 'Open {destination}',
	primaryShareImage: 'Share image',
	primaryShareLink: 'Share link',
	primaryShareText: 'Share',
	qrAlt: 'QR code for this page',
	qrTitle: 'Scan to continue on your phone',
	qrToggle: 'Continue on your phone',
	retry: 'Ready. Tap again to share.',
	saved: 'Saved',
	saveError: "Couldn't save. Try again.",
	suggested: 'Suggested',
	title: 'Share this page',
} as const;

export type ShareKitStringKey = keyof typeof shareKitStringDefaults;

export type ShareKitStrings = Record<ShareKitStringKey, string>;

export function isShareStringKey(key: string): key is ShareKitStringKey {
	return Object.hasOwn(shareKitStringDefaults, key);
}

export function formatShareString(template: string, values: Record<string, string>) {
	return template.replaceAll(/\{(\w+)\}/gu, (match, name: string) => values[name] ?? match);
}
