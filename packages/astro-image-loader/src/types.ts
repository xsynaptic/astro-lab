import type { LoaderContext } from 'astro/loaders';
import type { z } from 'zod';

export interface FileChangeQueueItem {
	filePath: string;
	id: string;
	type: 'add' | 'change' | 'unlink';
}

/**
 * Durable cache for dataHandler output, surviving Astro data store wipes
 * Keys are base-joined relative file paths; the loader owns all orchestration
 */
export interface ImageLoaderCache {
	get: (
		key: string,
	) => ImageLoaderCacheValue | Promise<ImageLoaderCacheValue | undefined> | undefined;
	/** Called after every full load with all live keys; evict the rest */
	prune?: (liveKeys: Array<string>) => Promise<void> | void;
	set: (key: string, value: ImageLoaderCacheValue) => Promise<void> | void;
}

export interface ImageLoaderCacheValue {
	/** dataHandler output for this entry; must be JSON-serializable (a Date returns as a string on a cache hit) */
	data: Record<string, unknown>;
	/** The per-entry digest current when this value was cached; a mismatch invalidates it */
	digest: string;
}

export type ImageLoaderDataHandler = (args: {
	filePath: string;
	filePathRelative: string;
	fileUrl: URL;
	id: string;
	logger: LoaderContext['logger'];
	modifiedTime: Date;
}) => Promise<Record<string, unknown>> | Record<string, unknown>;

/**
 * A prepackaged bundle of loader options, composed via the `plugins` option
 * dataHandler outputs merge flat (array order wins); schema fragments merge; hooks run in order; invalidationKeys fold into the digest
 * Just prepackaged options, so the single-handler API stays the escape hatch
 */
export interface ImageLoaderPlugin {
	/** Run once after loading all images and after each watch-mode batch */
	afterLoad?: () => Promise<void> | void;
	/** Run once before loading all images and before each watch-mode batch */
	beforeLoad?: () => Promise<void> | void;
	/** Metadata extraction callback; its output is merged into entry data */
	dataHandler?: ImageLoaderDataHandler;
	/** Serializable cache-busting key folded into every entry digest */
	invalidationKey?: string;
	/** Schema fragment describing this plugin's dataHandler output; merged into the collection schema */
	schema?: z.ZodObject;
}

interface LocalImageLoaderGenerateIdOptions {
	/** The base directory URL */
	base: URL;
	/** The path to the entry file, relative to the base directory */
	filePath: string;
}

// Valid image formats supported by Astro, lifted from `astro/src/assets/consts.ts`
// Astro does not export this constant publicly, so this pinned copy cannot be drift-tested
export const VALID_INPUT_FORMATS = [
	'jpeg',
	'jpg',
	'png',
	'tiff',
	'webp',
	'gif',
	'svg',
	'avif',
] as const;

export interface ImageLoaderOptions {
	/** Run once after loading all images and after each watch-mode batch (e.g. tear down a resource) */
	afterLoad?: () => Promise<void> | void;
	/** Directory to resolve images from, relative to the root or an absolute file URL; defaults to `.` */
	base: string;
	/** Run once before loading all images and before each watch-mode batch (e.g. set up a resource) */
	beforeLoad?: () => Promise<void> | void;
	/** Durable cache for dataHandler output, surviving Astro store wipes; a JSONL file under cacheDir by default, or pass an implementation or false to disable */
	cache?: false | ImageLoaderCache;
	/** How many images to process at a time */
	concurrency: number;
	/** Metadata extraction callback; its record output is merged into entry data and must match the collection schema */
	dataHandler?: ImageLoaderDataHandler;
	/** Debounce window for batching watch-mode file events, in milliseconds */
	debounceMs: number;
	/** Generates a per-collection-unique entry ID; defaults to the entry path */
	generateId: (options: LocalImageLoaderGenerateIdOptions) => string;
	/**
	 * Serializable cache-busting key folded into every entry digest
	 * Change it (*e.g.* when the collection schema or metadata extraction logic changes) to force all entries to regenerate
	 */
	invalidationKey?: string;
	/** Glob pattern(s) matched against paths relative to the base directory. Defaults to all Astro-supported raster formats */
	pattern: Array<string> | string;
	/**
	 * Prepackaged option bundles run alongside the single-handler API
	 * dataHandler outputs merge flat (array order wins, the inline dataHandler last); schema fragments merge; hooks run in order; invalidationKeys fold into the digest
	 */
	plugins?: Array<ImageLoaderPlugin>;
}
