import type { z } from 'zod';

import type { ImageLoaderDataHandler, ImageLoaderOptions } from './types.js';

import { ImageLoaderBaseSchema } from './base-schema.js';

export interface ComposedPluginOptions {
	afterLoad?: Hook;
	beforeLoad?: Hook;
	dataHandler?: ImageLoaderDataHandler;
	invalidationKey?: string;
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

	const invalidationKeys = [
		...plugins.map((plugin) => plugin.invalidationKey),
		options.invalidationKey,
	].filter((key): key is string => Boolean(key));

	// Merge plugin schema fragments in array order; a later fragment wins on field collision
	let schema: z.ZodObject = ImageLoaderBaseSchema;

	for (const plugin of plugins) {
		if (plugin.schema) schema = schema.extend(plugin.schema.shape);
	}

	// A single key passes through unchanged; multiple keys combine into one stable string
	let invalidationKey: string | undefined;

	if (invalidationKeys.length === 1) {
		invalidationKey = invalidationKeys[0];
	} else if (invalidationKeys.length > 1) {
		invalidationKey = JSON.stringify(invalidationKeys);
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
		...(invalidationKey === undefined ? {} : { invalidationKey }),
	};
}
