// Pagefind 1.6 ships declarations with extensionless relative imports, which `nodenext` resolves to `any`; this mirrors the subset the toggle calls

export interface PagefindInstance {
	components: Array<unknown>;
	deregisterAllShortcuts: (owner: Element) => void;
	getUtilities: (subtype: 'modal') => Array<{ isOpen: boolean; open: () => void }>;
	on: (event: 'results', callback: (result: unknown) => void) => void;
	registerShortcut: (shortcut: { description: string; label: string }, owner: Element) => void;
	registerUtility: (component: HTMLElement, subtype: 'modal-trigger') => void;
	searchTerm: string;
	unregisterComponent: (component: HTMLElement) => void;
}

export interface PagefindComponentUi {
	getInstanceManager: () => { getInstance: (name: string) => PagefindInstance };
}

// <pagefind-modal> reads these by name off a registered modal-trigger, so a rename fails silently
export interface PagefindModalTrigger {
	buttonEl: HTMLButtonElement | null;
	handleModalClose: () => void;
}
