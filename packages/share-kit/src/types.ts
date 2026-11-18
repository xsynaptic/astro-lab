import type { ShareKitImageFormat } from './formats.js';
import type { ShareKitStrings } from './strings.js';

export interface ShareKitAsset extends ShareKitImageFormat {
	alt: string;
	filename: string;
	isSuggestable?: boolean;
	label: string;
	previewSrc: string;
	src: string;
	type: string;
}

export type ShareKitClassRole = 'action' | 'destination' | 'heading' | 'input' | 'primary';

export interface ShareKitSettings<Id extends string> {
	classNames?: Partial<Record<ShareKitClassRole, string>>;
	destinations: ReadonlyArray<Id>;
	openHash?: string;
	utmMedium?: string;
}

export interface ShareKitPayload<Id extends string> {
	assets: ReadonlyArray<ShareKitAsset>;
	description?: string;
	locale: string;
	settings: ShareKitSettings<Id>;
	strings?: Partial<ShareKitStrings<Id>>;
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

// `shared` only means the share sheet took it: Windows resolves `navigator.share` when its picker opens, Android once an app takes over
export type ShareKitActionOutcome = 'dismissed' | 'error' | 'retry' | 'saved' | 'shared';

// The global event map can't take the host's id type, so the destination is any string
export interface ShareKitActionDetail {
	action: ShareKitAction;
	asset?: string;
	destination: string;
	outcome?: ShareKitActionOutcome;
}

declare global {
	interface GlobalEventHandlersEventMap {
		[shareKitActionEventName]: CustomEvent<ShareKitActionDetail>;
	}
}
