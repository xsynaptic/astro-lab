import type { Font, FontStyle, FontWeight } from 'satori';

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export interface FontsourceConfig {
	// Satori font family name (*e.g.* Archivo)
	name: string;
	// @fontsource package without the scope (*e.g.* archivo)
	package: string;
	variants: Array<FontVariant>;
}

export interface FontsourceOptions {
	// Resolve @fontsource from the consumer
	resolveFrom?: string;
}

export interface FontVariant {
	style: FontStyle;
	subset: string;
	weight: FontWeight;
}

// Satori reads ttf/otf/woff but not woff2; @fontsource ships .woff
export async function fontsourceFonts(
	configs: Array<FontsourceConfig>,
	options: FontsourceOptions = {},
): Promise<Array<Font>> {
	const resolver = createRequire(options.resolveFrom ?? import.meta.url);
	const fonts: Array<Font> = [];

	for (const config of configs) {
		for (const variant of config.variants) {
			const filename = `${config.package}-${variant.subset}-${String(variant.weight)}-${variant.style}.woff`;
			const packageJson = resolver.resolve(`@fontsource/${config.package}/package.json`);
			const data = await fs.readFile(path.join(path.dirname(packageJson), 'files', filename));

			fonts.push({
				data: data.buffer,
				name: config.name,
				style: variant.style,
				weight: variant.weight,
			});
		}
	}

	return fonts;
}
