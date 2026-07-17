import type { Loader, LoaderContext } from 'astro/loaders';
import type { z } from 'zod';

import { AstroError } from 'astro/errors';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';
import picomatch from 'picomatch';
import { glob } from 'tinyglobby';

import type { ImageLoaderCache, ImageLoaderOptions } from './types.js';

import { createChangeQueue } from './change-queue.js';
import { composePlugins } from './compose-plugins.js';
import { createJsonlCache } from './jsonl-cache.js';
import { VALID_INPUT_FORMATS } from './types.js';

export { ImageLoaderBaseSchema } from './base-schema.js';

export { createJsonlCache } from './jsonl-cache.js';
export type {
	ImageLoaderCache,
	ImageLoaderCacheValue,
	ImageLoaderDataHandler,
	ImageLoaderOptions,
	ImageLoaderPlugin,
} from './types.js';

const defaultPatternFormats = VALID_INPUT_FORMATS.filter((format) => format !== 'svg');

const defaultOptions = {
	base: '.',
	concurrency: 50,
	debounceMs: 300,
	generateId: ({ filePath }) => filePath,
	pattern: `**/*.{${defaultPatternFormats.join(',')}}`,
	progressInterval: 100,
	showProgress: true,
} as const satisfies ImageLoaderOptions;

/**
 * Returns a `{ loader, schema }` pair for `defineCollection`
 * Without a schema, the base schema plus any plugin fragments are used
 * For an `image()` field, skip this helper and pass a function schema to `defineCollection` directly
 */
export function defineImageCollection<TSchema extends z.ZodType = z.ZodObject>({
	schema,
	...options
}: Partial<ImageLoaderOptions> & { schema?: TSchema }) {
	const loader = imageLoader(options);

	// loader.schema already holds the composed base + plugin schema; no need to recompose
	return {
		loader,
		schema: (schema ?? loader.schema) as TSchema,
	};
}

export function imageLoader(optionsPartial: Partial<ImageLoaderOptions>) {
	// Fold plugins + the inline single-handler options into one effective handler set
	const { schema: composedSchema, ...composedOptions } = composePlugins(optionsPartial);

	const options = {
		...defaultOptions,
		...optionsPartial,
		...composedOptions,
	} satisfies ImageLoaderOptions;

	const patterns = Array.isArray(options.pattern) ? options.pattern : [options.pattern];

	if (patterns.some((pattern) => pattern.startsWith('../'))) {
		throw new AstroError(
			'Image loader glob patterns cannot start with `../`.',
			'Set the `base` option to a parent directory instead.',
		);
	}

	if (patterns.some((pattern) => pattern.startsWith('/'))) {
		throw new AstroError(
			'Image loader glob patterns cannot be absolute paths.',
			'Set the `base` option to a parent directory and use a relative pattern instead.',
		);
	}

	return {
		load: async function load(context: LoaderContext): Promise<void> {
			// eslint-disable-next-line @typescript-eslint/unbound-method -- Astro's LoaderContext is meant to be destructured
			const { collection, config, generateDigest, logger, parseData, store, watcher } = context;

			let cache: ImageLoaderCache | undefined;

			if (options.cache) {
				cache = options.cache;
			} else if (options.cache !== false && options.dataHandler) {
				cache = createJsonlCache({
					filePath: fileURLToPath(
						new URL(`astro-image-loader/${collection}.jsonl`, config.cacheDir),
					),
				});
			}

			const baseDir = new URL(options.base, config.root);

			if (!baseDir.pathname.endsWith('/')) {
				baseDir.pathname = `${baseDir.pathname}/`;
			}

			const baseDirPath = fileURLToPath(baseDir);

			if (!existsSync(baseDirPath)) {
				logger.warn(`Image directory "${options.base}" does not exist. No images will be loaded.`);
				return;
			}

			const rootPath = fileURLToPath(config.root);

			const filePaths = await glob(options.pattern, {
				cwd: baseDirPath,
				expandDirectories: false,
			});

			if (filePaths.length === 0) {
				logger.warn(`No images found matching "${patterns.join(', ')}" in "${options.base}"`);
			} else {
				logger.info(`Syncing ${imageCount(filePaths.length)}`);
			}

			// Keep track of entries that are no longer present (*e.g.* deleted)
			const untouchedEntries = new Set(store.keys());

			// Watch-mode reloads reuse syncData; syncing gates interval lines to the initial pass
			const stats = { fromCache: 0, processed: 0, skipped: 0, syncing: true, unchanged: 0 };

			const syncData = getSyncDataFunction({
				baseDir,
				cache,
				generateDigest,
				logger,
				options,
				parseData,
				root: config.root,
				stats,
				store,
			});

			await options.beforeLoad?.();

			await Promise.all(
				filePaths.map((filePath) => {
					const id = options.generateId({ base: baseDir, filePath });

					// This entry will be synced; don't remove it later on
					untouchedEntries.delete(id);

					return syncData({ filePath, id });
				}),
			);

			stats.syncing = false;

			if (options.showProgress && filePaths.length > 0) {
				const skipped = stats.skipped > 0 ? `, ${String(stats.skipped)} skipped` : '';

				logger.info(
					`Synced ${imageCount(filePaths.length)}: ${String(stats.unchanged)} unchanged, ${String(stats.fromCache)} restored from cache, ${String(stats.processed)} processed${skipped}`,
				);
			}

			// Remove entries that were not found this time; they were presumably deleted
			for (const id of untouchedEntries) {
				store.delete(id);
			}

			// Evict cache rows for deleted or renamed files; keys must match syncData's cache keys
			await cache?.prune?.(
				filePaths.map((filePath) => toRootRelativePath(rootPath, baseDirPath, filePath)),
			);

			await options.afterLoad?.();

			if (!watcher) return;

			// The base directory may sit outside the default watch root
			watcher.add(baseDirPath);

			const filePathMatches = getFilePathMatchesFunction(options.pattern, baseDir);

			const changeQueue = createChangeQueue({
				debounceMs: options.debounceMs,
				onBatchEnd: async () => {
					await options.afterLoad?.();
				},
				onBatchStart: async () => {
					await options.beforeLoad?.();
				},
				onError: (error, change) => {
					if (change) {
						logger.error(
							`Error processing ${change.type} for ${change.filePath}: ${getErrorMessage(error)}`,
						);
					} else {
						logger.error(`Error processing image changes: ${getErrorMessage(error)}`);
					}
				},
				processChange: async (change) => {
					if (change.type === 'unlink') {
						store.delete(change.id);
						logger.info(`Deleted from store: ${change.filePath}`);
						return;
					}
					await syncData({ filePath: change.filePath, id: change.id });
					logger.info(`Reloaded data from ${change.filePath}`);
				},
			});

			function queueChange(changedPath: string, type: 'add' | 'change' | 'unlink') {
				const filePath = filePathMatches(changedPath);

				if (!filePath) return;

				const id = options.generateId({ base: baseDir, filePath });

				changeQueue.add({ filePath, id, type });
			}

			watcher.on('change', (changedPath) => {
				queueChange(changedPath, 'change');
			});

			watcher.on('add', (changedPath) => {
				queueChange(changedPath, 'add');
			});

			watcher.on('unlink', (changedPath) => {
				queueChange(changedPath, 'unlink');
			});
		},
		name: '@xsynaptic/astro-image-loader',
		// Set so a collection works zero-config; a consumer schema on defineCollection overrides it
		schema: composedSchema,
	} satisfies Loader;
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

// Only return the relative path if it matches what we're watching
function getFilePathMatchesFunction(pattern: Array<string> | string, baseDir: URL) {
	const matcher = picomatch(pattern);

	const basePath = fileURLToPath(baseDir);

	return function filePathMatches(changedPath: string) {
		const pathRelative = path.relative(basePath, changedPath);
		const filePath = pathRelative.split(path.sep).join('/');

		if (!filePath.startsWith('../') && matcher(filePath)) return filePath;
		return;
	};
}

function getSyncDataFunction({
	baseDir,
	cache,
	generateDigest,
	logger,
	options,
	parseData,
	root,
	stats,
	store,
}: Pick<LoaderContext, 'generateDigest' | 'logger' | 'parseData' | 'store'> & {
	baseDir: URL;
	cache?: ImageLoaderCache | undefined;
	options: ImageLoaderOptions;
	root: URL;
	stats: {
		fromCache: number;
		processed: number;
		skipped: number;
		syncing: boolean;
		unchanged: number;
	};
}) {
	// Limit the concurrency of files processed to reduce memory usage
	const limit = pLimit(options.concurrency);

	const rootPath = fileURLToPath(root);
	const basePath = fileURLToPath(baseDir);

	return async function syncData({ filePath, id }: { filePath: string; id: string }) {
		return limit(async () => {
			const fileUrl = new URL(encodeURI(filePath), baseDir);

			let modifiedTime: Date;

			try {
				const fileStats = await stat(fileURLToPath(fileUrl));

				modifiedTime = fileStats.mtime;
			} catch {
				stats.skipped++;
				logger.warn(`Could not read file stats for ${filePath}; skipping`);
				return;
			}

			// Intrinsic inputs only; derivationVersion changes must not bust cached extraction
			const cacheDigest = generateDigest({
				extractionVersion: options.extractionVersion,
				filePath,
				id,
				mtime: modifiedTime,
			});

			// Store digest layers derivationVersion on top so derived values refresh on context change
			const digest =
				options.derivationVersion === undefined
					? cacheDigest
					: generateDigest({ cacheDigest, derivationVersion: options.derivationVersion });

			// If the data entry is already in the store and seems current, skip further processing
			// The store is keyed by id, not filePath
			const existingEntry = store.get(id);

			if (existingEntry?.digest === digest && existingEntry.filePath) {
				stats.unchanged++;
				// Asset imports from image() schema fields are only registered by store.set on fresh writes
				// Re-register on the skip path or those fields lose their Vite modules on incremental builds
				if (existingEntry.assetImports?.length) {
					// addAssetImports is real at runtime but absent from the public DataStore types
					const storeWithAssets = store as typeof store & {
						addAssetImports: (assets: Array<string>, fileName: string) => void;
					};

					storeWithAssets.addAssetImports(existingEntry.assetImports, existingEntry.filePath);
				}
				return;
			}

			// Root-relative path for the store; importable and used as the cache key
			const filePathRelative = toRootRelativePath(rootPath, basePath, filePath);

			let handlerData: Record<string, unknown> = {};

			if (options.dataHandler) {
				const cached = await cache?.get(filePathRelative);

				if (cached?.digest === cacheDigest) {
					handlerData = cached.data;
					stats.fromCache++;
				} else {
					handlerData = await options.dataHandler({
						filePath,
						filePathRelative,
						fileUrl,
						id,
						logger,
						modifiedTime,
					});

					await cache?.set(filePathRelative, { data: handlerData, digest: cacheDigest });
					stats.processed++;
					logger.debug(`Extracted metadata from ${filePathRelative}`);
				}
			} else {
				stats.processed++;
			}

			if (options.showProgress && stats.syncing) {
				const worked = stats.fromCache + stats.processed;

				if (worked % options.progressInterval === 0) {
					logger.info(`Processed ${imageCount(worked)} (${String(stats.fromCache)} from cache)`);
				}
			}

			// parseData throws a well-formatted AstroError on schema validation failure
			// filePath is root-relative (matching Astro's own loaders) so image() fields resolve
			const parsedData = await parseData({
				data: {
					modifiedTime,
					src: filePathRelative,
					...handlerData,
				},
				filePath: filePathRelative,
				id,
			});

			store.set({
				data: parsedData,
				digest,
				filePath: filePathRelative,
				id,
			});
		});
	};
}

function imageCount(count: number) {
	return `${String(count)} ${count === 1 ? 'image' : 'images'}`;
}

// Root-relative, forward-slashed path for the store, matching Astro's own loaders
// Works whether `base` is root-relative or absolute; the store rejects absolute paths
// Pure path math (no file URL) so `#`/`?`/`%` in filenames aren't mangled by URL encoding
function toRootRelativePath(rootPath: string, basePath: string, filePath: string) {
	return path.relative(rootPath, path.join(basePath, filePath)).split(path.sep).join('/');
}
