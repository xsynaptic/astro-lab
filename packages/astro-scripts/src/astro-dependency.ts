import type * as Vite from 'vite';

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Astro's plugins need its own Vite, and the store digests need its own xxhash
export async function importFromAstro<Module>(specifier: string) {
	const astroPackagePath = createRequire(import.meta.url).resolve('astro/package.json');
	const modulePath = createRequire(astroPackagePath).resolve(specifier);

	return (await import(pathToFileURL(modulePath).href)) as Module;
}

export function importVite() {
	return importFromAstro<typeof Vite>('vite');
}
