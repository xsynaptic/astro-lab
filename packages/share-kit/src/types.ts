import type { ShareKitDestinationId } from './destinations.js';
import type { ShareKitStringKey } from './strings.js';

export type ShareKitAssetRole = 'landscape' | 'photo' | 'portrait' | 'story';

export interface ShareKitAsset {
	alt: string;
	filename: string;
	height: number;
	label: string;
	previewSrc: string;
	role: ShareKitAssetRole;
	src: string;
	type: string;
	width: number;
}

export type ShareKitClassRole = 'action' | 'destination' | 'heading' | 'input' | 'primary';

export interface ShareKitSettings {
	classNames?: Partial<Record<ShareKitClassRole, string>>;
	destinations: ReadonlyArray<ShareKitDestinationId>;
	destinationsMore?: ReadonlyArray<ShareKitDestinationId>;
	openHash?: string;
	utmMedium?: string;
}

export interface ShareKitPayload {
	assets: ReadonlyArray<ShareKitAsset>;
	description?: string;
	locale: string;
	settings: ShareKitSettings;
	strings?: Partial<Record<ShareKitStringKey, string>>;
	title: string;
	url: string;
}

export const shareKitActionEventName = 'share-kit:action';

export type ShareKitAction =
	| 'copy'
	| 'copy-caption'
	| 'copy-link'
	| 'destination'
	| 'open'
	| 'open-composer'
	| 'qr'
	| 'save'
	| 'share'
	| 'share-link'
	| 'share-text';

export interface ShareKitActionDetail {
	action: ShareKitAction;
	asset?: string;
	destination: ShareKitDestinationId;
}

declare global {
	interface GlobalEventHandlersEventMap {
		[shareKitActionEventName]: CustomEvent<ShareKitActionDetail>;
	}
}
