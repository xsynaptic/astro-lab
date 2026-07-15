import type { CatalogFont } from '../shared/types.js';

import { toBaseScripts } from './scripts.js';

// No scripts selected means no script filter, not an empty result
export function filterFonts(
	fonts: Array<CatalogFont>,
	activeProviders: Set<string>,
	activeScripts: Set<string>,
): Array<CatalogFont> {
	return fonts.filter(
		(font) =>
			font.providers.some((provider) => activeProviders.has(provider)) &&
			(activeScripts.size === 0 ||
				toBaseScripts(font.scripts).some((script) => activeScripts.has(script))),
	);
}
