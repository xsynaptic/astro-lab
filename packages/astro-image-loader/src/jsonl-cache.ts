import type { WriteStream } from 'node:fs';

import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ImageLoaderCache, ImageLoaderCacheValue } from './types.js';

interface JsonlCacheLine {
	key: string;
	value: ImageLoaderCacheValue;
}

/**
 * Minimal durable cache: one JSON object per line, appended as entries are processed
 * Appends make partial progress crash-safe; prune compacts the file to live keys only
 */
export function createJsonlCache({ filePath }: { filePath: string }): ImageLoaderCache {
	let hydration: Promise<Map<string, ImageLoaderCacheValue>> | undefined;
	let appendStream: undefined | WriteStream;

	// Tracks non-empty file lines so prune can tell when the file diverges from the live map
	let fileLineCount = 0;

	// Memoize the promise, not the map, or concurrent callers see an empty cache mid-read
	function hydrate() {
		if (hydration) return hydration;

		hydration = (async () => {
			const entries = new Map<string, ImageLoaderCacheValue>();

			if (existsSync(filePath)) {
				let contents = '';

				// A failed read degrades to an empty cache rather than poisoning every later call
				// Whatever broke the read will surface loudly when the append stream opens
				try {
					contents = await readFile(filePath, 'utf8');
				} catch (error) {
					console.warn(`[astro-image-loader] cache read failed, starting empty: ${String(error)}`);
				}

				// Later lines win; malformed lines (e.g. from an interrupted write) are skipped
				for (const line of contents.split('\n')) {
					if (!line) continue;
					fileLineCount++;
					try {
						const parsed = JSON.parse(line) as JsonlCacheLine;

						entries.set(parsed.key, parsed.value);
					} catch {
						continue;
					}
				}
			}
			return entries;
		})();

		return hydration;
	}

	async function getAppendStream() {
		if (appendStream) return appendStream;

		await mkdir(path.dirname(filePath), { recursive: true });
		appendStream = createWriteStream(filePath, { flags: 'a' });
		return appendStream;
	}

	return {
		get: async (key) => {
			const cache = await hydrate();

			return cache.get(key);
		},
		prune: async (liveKeys) => {
			const cache = await hydrate();
			const liveKeySet = new Set(liveKeys);

			let removedCount = 0;

			for (const key of cache.keys()) {
				if (liveKeySet.has(key)) continue;

				cache.delete(key);
				removedCount++;
			}

			// Rewrite only when the file diverges from the live map
			// Divergence means dead keys just removed, or excess lines (superseded duplicates, junk)
			if (removedCount === 0 && fileLineCount === cache.size) return;

			// Compact: rewrite with live keys only, atomically via temp file + rename
			if (appendStream) {
				await new Promise((resolve) => appendStream?.end(resolve));
				appendStream = undefined;
			}

			const lines = [...cache].map(([key, value]) =>
				JSON.stringify({ key, value } satisfies JsonlCacheLine),
			);
			const tempPath = `${filePath}.tmp`;

			await mkdir(path.dirname(filePath), { recursive: true });
			await writeFile(tempPath, lines.length > 0 ? `${lines.join('\n')}\n` : '');
			await rename(tempPath, filePath);

			fileLineCount = cache.size;
		},
		set: async (key, value) => {
			const cache = await hydrate();

			cache.set(key, value);

			const stream = await getAppendStream();
			const line = `${JSON.stringify({ key, value } satisfies JsonlCacheLine)}\n`;

			await new Promise<void>((resolve, reject) => {
				stream.write(line, (error) => {
					if (error) {
						reject(error);
					} else {
						resolve();
					}
				});
			});

			fileLineCount++;
		},
	};
}
