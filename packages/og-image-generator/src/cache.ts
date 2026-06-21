import { promises as fs } from 'node:fs';
import path from 'node:path';

// Records the last key seen per id so freshness survives across builds
export interface CacheStore {
	get: (id: string) => Promise<string | undefined>;
	set: (id: string, key: string) => Promise<void>;
}

export interface ContentHashCacheOptions {
	dir: string;
	extension?: string;
}

// The cache port; createContentHashCache (runtime) and createStableCache (build) implement it
export interface OgCache {
	resolve: (input: OgCacheInput) => Promise<Buffer>;
}

export interface OgCacheInput {
	generate: () => Promise<Buffer>;
	// Stable identity for the entry
	id: string;
	// Changing this invalidates the cached image
	key: string;
}

export interface StableCache extends OgCache {
	// Skip a fresh entry without reading the file back
	isFresh: (id: string, key: string) => Promise<boolean>;
}

export interface StableCacheOptions {
	dir: string;
	extension?: string;
	store: CacheStore;
	// Folded into every key, so a bump invalidates the whole cache
	version?: string;
}

// Runtime adapter: a hashed filename is the freshness check, with in-flight
// request dedupe and stale-variant pruning
export function createContentHashCache(options: ContentHashCacheOptions): OgCache {
	const { dir, extension = 'jpg' } = options;
	const inflight = new Map<string, Promise<Buffer>>();

	function filePath(id: string, key: string): string {
		return path.join(dir, `${id}.${key}.${extension}`);
	}

	async function read(target: string): Promise<Buffer | undefined> {
		try {
			return await fs.readFile(target);
		} catch {
			return undefined;
		}
	}

	async function removeStale(id: string, keep: string): Promise<void> {
		try {
			const names = await fs.readdir(dir);

			await Promise.allSettled(
				names
					.filter((name) => name.startsWith(`${id}.`) && name !== keep)
					.map((name) => fs.unlink(path.join(dir, name))),
			);
		} catch {
			// Nothing to clean
		}
	}

	async function store(
		id: string,
		target: string,
		generate: () => Promise<Buffer>,
	): Promise<Buffer> {
		const buffer = await generate();

		await fs.mkdir(dir, { recursive: true });
		await removeStale(id, path.basename(target));
		await fs.writeFile(target, new Uint8Array(buffer));

		return buffer;
	}

	async function resolve({ generate, id, key }: OgCacheInput): Promise<Buffer> {
		const target = filePath(id, key);
		const cached = await read(target);
		if (cached) return cached;

		// Register the in-flight promise synchronously so concurrent callers dedupe
		let promise = inflight.get(target);

		if (!promise) {
			promise = (async () => {
				try {
					return await store(id, target, generate);
				} finally {
					inflight.delete(target);
				}
			})();
			inflight.set(target, promise);
		}

		return promise;
	}

	return { resolve };
}

// Build adapter: a stable filename keeps the public URL fixed
// Freshness is tracked in an injectable store
export function createStableCache(options: StableCacheOptions): StableCache {
	const { dir, extension = 'jpg', store, version } = options;

	function filePath(id: string): string {
		return path.join(dir, `${id}.${extension}`);
	}

	function effectiveKey(key: string): string {
		return version ? `${version}:${key}` : key;
	}

	async function isFresh(id: string, key: string): Promise<boolean> {
		const recorded = await store.get(id);
		if (recorded !== effectiveKey(key)) return false;

		try {
			await fs.access(filePath(id));

			return true;
		} catch {
			return false;
		}
	}

	async function resolve({ generate, id, key }: OgCacheInput): Promise<Buffer> {
		const target = filePath(id);
		if (await isFresh(id, key)) return fs.readFile(target);

		const buffer = await generate();

		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(target, new Uint8Array(buffer));
		await store.set(id, effectiveKey(key));

		return buffer;
	}

	return {
		isFresh,
		resolve,
	};
}
