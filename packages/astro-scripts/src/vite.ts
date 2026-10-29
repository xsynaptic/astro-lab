import type * as Vite from 'vite';

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Astro's plugins expect Astro's own copy of Vite
export async function importVite() {
	const astroPackagePath = createRequire(import.meta.url).resolve('astro/package.json');
	const vitePath = createRequire(astroPackagePath).resolve('vite');

	return (await import(pathToFileURL(vitePath).href)) as typeof Vite;
}
