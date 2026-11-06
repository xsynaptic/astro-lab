import type { AstroIntegration } from 'astro';

import { z } from 'zod';

import { createCatalogHandler } from './server/catalog.js';
import { createResolveHandler } from './server/resolve.js';
import { icons } from './shared/icons.js';
import { providerNames } from './shared/types.js';

const optionsSchema = z
	.strictObject({
		/** Which font providers to browse. Defaults to Fontsource only. */
		providers: z.array(z.enum(providerNames)).min(1).default(['fontsource']),
		/** Targets pre-loaded as rows: CSS custom properties (e.g. `--font-display`) or selectors
		 * (e.g. `h1`, `.hero`). Optional; targets can also be added from the toolbar at runtime. */
		targets: z.array(z.string()).default([]),
	})
	.prefault({});

type Options = z.input<typeof optionsSchema>;

const appId = 'astro-font-devtools';

function parseOptions(options: Options) {
	const result = optionsSchema.safeParse(options);

	if (!result.success) {
		throw new Error(
			`[@xsynaptic/astro-font-devtools] Invalid options\n${z.prettifyError(result.error)}`,
		);
	}

	return result.data;
}

export default function fontDevtools(options?: Options): AstroIntegration {
	const { providers, targets } = parseOptions(options);

	return {
		hooks: {
			'astro:config:setup': ({ addDevToolbarApp, command }) => {
				if (command !== 'dev') return;
				addDevToolbarApp({
					entrypoint: new URL(
						import.meta.url.endsWith('.ts') ? 'toolbar.ts' : 'toolbar.mjs',
						import.meta.url,
					),
					icon: icons.font,
					id: appId,
					name: 'Font Devtools',
				});
			},
			'astro:server:setup': ({ server, toolbar }) => {
				server.middlewares.use('/__astro-font-devtools/catalog', createCatalogHandler(providers));
				server.middlewares.use('/__astro-font-devtools/resolve', createResolveHandler(providers));
				toolbar.onAppInitialized(appId, () => {
					toolbar.send(`${appId}:config`, { targets });
				});
			},
		},
		name: '@xsynaptic/astro-font-devtools',
	};
}
