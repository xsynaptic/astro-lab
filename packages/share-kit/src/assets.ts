import type { ShareAssetSource } from './actions.js';
import type { ShareKitActionOutcome } from './types.js';

import { fetchFile, isDomError, saveFile } from './actions.js';

export type ShareOutcome = 'unsaved' | ShareKitActionOutcome;

interface ShareAssetFilesOptions {
	canShare: boolean;
	getSource: (tile: HTMLElement) => ShareAssetSource | undefined;
	signal: AbortSignal;
}

function isFile(file: File | undefined): file is File {
	return file !== undefined;
}

export class ShareAssetFiles {
	#files = new Map<HTMLElement, File>();
	#loads = new Map<HTMLElement, Promise<File | undefined>>();
	#objectUrls = new Set<string>();
	#options: ShareAssetFilesOptions;

	constructor(options: ShareAssetFilesOptions) {
		this.#options = options;
	}

	dispose() {
		for (const objectUrl of this.#objectUrls) URL.revokeObjectURL(objectUrl);

		this.#objectUrls.clear();
		this.#files.clear();
		this.#loads.clear();
	}

	load(tile: HTMLElement) {
		const pending = this.#loads.get(tile);

		if (pending) return pending;

		const promise = this.#fetch(tile);

		this.#loads.set(tile, promise);

		return promise;
	}

	async save(tile: HTMLElement): Promise<ShareOutcome> {
		const file = await this.load(tile);

		return file ? this.#saveFiles([file]) : 'unsaved';
	}

	async share(tiles: Array<HTMLElement>): Promise<ShareOutcome> {
		const ready = tiles.map((tile) => this.#files.get(tile));

		// Calling `share()` before any await keeps the tap's user activation valid
		if (ready.every(isFile)) return this.#shareFiles(ready);

		const loaded = await Promise.all(tiles.map((tile) => this.load(tile)));

		return loaded.every(isFile) ? this.#shareFiles(loaded) : 'error';
	}

	// Warming on hover lets the share call still start inside the tap
	warm(target: EventTarget | null) {
		if (!(target instanceof Element)) return;

		const tile = target
			.closest('[data-share-kit-action="share"]')
			?.closest<HTMLElement>('[data-share-kit-asset]');

		if (tile) void this.load(tile);
	}

	// A failed load is forgotten so the next tap tries again
	async #fetch(tile: HTMLElement) {
		const source = this.#options.getSource(tile);

		if (!source) return;

		try {
			const file = await fetchFile(source, this.#options.signal);

			this.#files.set(tile, file);

			return file;
		} catch {
			this.#loads.delete(tile);

			return;
		}
	}

	#saveFiles(files: Array<File>): ShareOutcome {
		for (const file of files) this.#objectUrls.add(saveFile(file));

		return 'saved';
	}

	async #shareFiles(files: Array<File>): Promise<ShareOutcome> {
		if (!this.#options.canShare || !navigator.canShare({ files })) return this.#saveFiles(files);

		try {
			await navigator.share({ files });

			return 'shared';
		} catch (error) {
			if (isDomError(error, 'AbortError') || this.#options.signal.aborted) return 'dismissed';

			// A slow load used up the tap's activation; the files are ready now, so another tap works
			if (isDomError(error, 'NotAllowedError')) return 'retry';

			return this.#saveFiles(files);
		}
	}
}
