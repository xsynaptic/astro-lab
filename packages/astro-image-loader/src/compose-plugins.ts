import type { z } from 'zod';

import type { ImageLoaderDataHandler, ImageLoaderOptions } from './types.js';

import { ImageLoaderBaseSchema } from './base-schema.js';

export interface ComposedPluginOptions {
	afterLoad?: Hook;
	beforeLoad?: Hook;
	dataHandler?: ImageLoaderDataHandler;
	extractionVersion?: string;
	schema: z.ZodObject;
}

type Hook = () => Promise<void> | void;

/**
 * Fold the `plugins` array plus the inline single-handler options into one effective option set
 * Plugins run in array order and the inline handler runs last, so the inline API stays the escape hatch
 */
export function composePlugins(options: Partial<ImageLoaderOptions>): ComposedPluginOptions {
	const plugins = options.plugins ?? [];

	const dataHandlers = [...plugins.map((plugin) => plugin.dataHandler), options.dataHandler].filter(
		(handler): handler is ImageLoaderDataHandler => Boolean(handler),
	);

	const beforeLoads = [...plugins.map((plugin) => plugin.beforeLoad), options.beforeLoad].filter(
		(hook): hook is Hook => Boolean(hook),
	);

	const afterLoads = [...plugins.map((plugin) => plugin.afterLoad), options.afterLoad].filter(
		(hook): hook is Hook => Boolean(hook),
	);

	const extractionVersion = foldExtractionVersions([
		...plugins.map((plugin) => plugin.extractionVersion),
		options.extractionVersion,
	]);

	// Merge plugin schema fragments in array order; a later fragment wins on field collision
	let schema: z.ZodObject = ImageLoaderBaseSchema;

	for (const plugin of plugins) {
		if (plugin.schema) schema = schema.extend(plugin.schema.shape);
	}

	return {
		schema,
		...(dataHandlers.length > 0
			? {
					dataHandler: async (args) => {
						const merged: Record<string, unknown> = {};

						// Serial so plugins can share resources (e.g. a single ExifTool instance) deterministically
						// Later handlers win on key collision, so array order is precedence
						for (const handler of dataHandlers) {
							Object.assign(merged, await handler(args));
						}

						return merged;
					},
				}
			: {}),
		...(beforeLoads.length > 0
			? {
					beforeLoad: async () => {
						for (const hook of beforeLoads) await hook();
					},
				}
			: {}),
		...(afterLoads.length > 0
			? {
					afterLoad: async () => {
						for (const hook of afterLoads) await hook();
					},
				}
			: {}),
		...(extractionVersion === undefined ? {} : { extractionVersion }),
	};
}

// A single version passes through unchanged; multiple versions combine into one stable string
function foldExtractionVersions(versions: Array<string | undefined>) {
	const filtered = versions.filter((key): key is string => Boolean(key));

	if (filtered.length === 1) return filtered[0];
	if (filtered.length > 1) return JSON.stringify(filtered);
	return;
}
