import type { AstroIntegration } from 'astro';

import type { ProviderName } from './shared/types.js';

import { createCatalogHandler } from './server/catalog.js';
import { createResolveHandler } from './server/resolve.js';
import { icons } from './shared/icons.js';

interface Options {
	/** Which font providers to browse. Defaults to Fontsource only. */
	providers?: Array<ProviderName>;
	/** Targets pre-loaded as rows: CSS custom properties (e.g. `--font-display`) or selectors
	 * (e.g. `h1`, `.hero`). Optional; targets can also be added from the toolbar at runtime. */
	targets?: Array<string>;
}

const appId = 'astro-font-devtools';

export default function fontDevtools(options: Options = {}): AstroIntegration {
	const { providers = ['fontsource'], targets = [] } = options;

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
