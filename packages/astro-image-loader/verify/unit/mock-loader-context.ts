import type { LoaderContext } from 'astro/loaders';

import { EventEmitter } from 'node:events';
import { vi } from 'vitest';

interface MockDataEntry {
	assetImports?: Array<string>;
	data: Record<string, unknown>;
	digest?: string;
	filePath?: string;
	id: string;
}

interface MockLoaderContextOptions {
	parseData?: LoaderContext['parseData'];
	root: URL;
}

// Astro's ContentLayer and MutableDataStore are internal; mock only the surface the loader touches
export function createMockLoaderContext({ parseData, root }: MockLoaderContextOptions) {
	const entries = new Map<string, MockDataEntry>();
	const logs: Array<{ level: 'debug' | 'error' | 'info' | 'warn'; message: string }> = [];
	const addAssetImports = vi.fn<(imports: Array<string>, filePath: string) => void>();

	// eslint-disable-next-line unicorn/prefer-event-target -- mimics chokidar's FSWatcher, which is an EventEmitter
	const watcher = Object.assign(new EventEmitter(), { add: vi.fn<(path: string) => void>() });

	const defaultParseData = (({ data }: { data: Record<string, unknown> }) =>
		Promise.resolve(data)) as LoaderContext['parseData'];

	const context = {
		collection: 'images',
		config: { cacheDir: new URL('.astro-cache/', root), root },
		// Mimics Astro's implementation: JSON.stringify silently drops function values
		generateDigest: (data: Record<string, unknown> | string) =>
			typeof data === 'string' ? data : JSON.stringify(data),
		logger: {
			debug: (message: string) => {
				logs.push({ level: 'debug', message });
			},
			error: (message: string) => {
				logs.push({ level: 'error', message });
			},
			info: (message: string) => {
				logs.push({ level: 'info', message });
			},
			warn: (message: string) => {
				logs.push({ level: 'warn', message });
			},
		},
		parseData: parseData ?? defaultParseData,
		store: {
			addAssetImports,
			delete: (id: string) => {
				entries.delete(id);
			},
			get: (id: string) => entries.get(id),
			keys: () => [...entries.keys()],
			set: (entry: MockDataEntry) => {
				entries.set(entry.id, entry);
				return true;
			},
		},
		watcher,
	} as unknown as LoaderContext;

	return { addAssetImports, context, entries, logs, watcher };
}
