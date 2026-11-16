import type { ShareKitDestinationId } from './destinations.js';

export type ShareKitIconName = 'close' | 'more' | 'qr' | ShareKitDestinationId;

export type ShareKitIcons = Partial<Record<ShareKitIconName, string>>;

export const shareKitInterfaceIcons = {
	any: 'M3.16 14.47L5.99 11.65A4.5 4.5 0 0 1 12.35 18.01L9.53 20.84A4.5 4.5 0 0 1 3.16 14.47ZM4.58 15.89A2.5 2.5 0 0 0 8.11 19.42L10.94 16.6A2.5 2.5 0 0 0 7.4 13.06ZM11.65 5.99L14.47 3.16A4.5 4.5 0 0 1 20.84 9.53L18.01 12.35A4.5 4.5 0 0 1 11.65 5.99ZM13.06 7.4A2.5 2.5 0 0 0 16.6 10.94L19.42 8.11A2.5 2.5 0 0 0 15.89 4.58ZM8.46 14.12L14.12 8.46L15.54 9.88L9.88 15.54Z',
	close:
		'M6 7.41 7.41 6 12 10.59 16.59 6 18 7.41 13.41 12 18 16.59 16.59 18 12 13.41 7.41 18 6 16.59 10.59 12Z',
	messages:
		'M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM5 6v9h14V6ZM7 17v4l4-4Z',
	more: 'M4 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0ZM10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0ZM16 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0Z',
	qr: 'M3 3h7v7H3ZM4.5 4.5v4h4v-4ZM5.5 5.5h2v2h-2ZM14 3h7v7h-7ZM15.5 4.5v4h4v-4ZM16.5 5.5h2v2h-2ZM3 14h7v7H3ZM4.5 15.5v4h4v-4ZM5.5 16.5h2v2h-2ZM14 14h2v2h-2ZM18 14h3v2h-3ZM16 16h2v2h-2ZM14 18h2v3h-2ZM18 18h3v3h-3Z',
} as const satisfies ShareKitIcons;
