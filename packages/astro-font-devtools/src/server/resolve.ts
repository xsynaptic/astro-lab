import type { FontFaceData, FontStyles, Provider, UnifontOptions } from 'unifont';
import type { Connect } from 'vite';

import { createUnifont, providers as unifontProviders } from 'unifont';

import type { ProviderName } from '../shared/types.js';

import { memoizeByProviders } from './provider-cache.js';

type Storage = NonNullable<UnifontOptions['storage']>;

const providerFactories = {
	bunny: unifontProviders.bunny,
	fontshare: unifontProviders.fontshare,
	fontsource: unifontProviders.fontsource,
	google: unifontProviders.google,
} satisfies Record<ProviderName, () => Provider>;

const fontStyles = new Set<string>(['italic', 'normal', 'oblique'] satisfies Array<FontStyles>);

const getUnifont = memoizeByProviders((providers) => {
	const [first, ...rest] = providers.map((name): Provider => providerFactories[name]());

	if (!first) throw new Error('astro-font-devtools: resolve handler needs at least one provider');

	return createUnifont([first, ...rest], { storage: memoryStorage() });
});

export function createResolveHandler(providers: Array<ProviderName>): Connect.NextHandleFunction {
	return (req, res) => {
		const query = parseResolveQuery(req.url ?? '', providers);

		if (!query) {
			res.statusCode = 400;
			res.end('/* missing family */');

			return;
		}

		const { family, scoped, styles, subsets, weights } = query;

		void (async () => {
			try {
				const unifont = await getUnifont(scoped);
				const result = await unifont.resolveFont(family, {
					formats: ['woff2'],
					styles,
					weights,
					// Omit when empty so unifont applies its multi-script default instead of being pinned
					...(subsets.length > 0 ? { subsets } : {}),
				});
				const css = result.fonts.map((face) => renderFontFace(family, face)).join('\n');
				res.setHeader('content-type', 'text/css');
				res.setHeader('cache-control', 'no-store');
				res.end(css);
			} catch {
				res.statusCode = 502;
				res.end('/* resolve failed */');
			}
		})();
	};
}

export function parseResolveQuery(url: string, providers: Array<ProviderName>) {
	const params = new URL(url, 'http://localhost').searchParams;
	const family = params.get('family');

	if (!family) return;

	const provider = params.get('provider');
	const weights = (params.get('weights') ?? '400,700').split(',');
	const styles = (params.get('styles') ?? 'normal,italic')
		.split(',')
		.filter((style): style is FontStyles => fontStyles.has(style));
	const subsets = (params.get('subsets') ?? '')
		.split(',')
		.map((subset) => subset.trim())
		.filter(Boolean);
	const scoped =
		provider && isProviderName(provider) && providers.includes(provider) ? [provider] : providers;

	return { family, scoped, styles, subsets, weights };
}

export function renderFontFace(family: string, data: FontFaceData): string {
	const src = data.src
		.map((source) =>
			'name' in source
				? `local("${source.name}")`
				: `url("${source.url}")${source.format ? ` format("${source.format}")` : ''}`,
		)
		.join(', ');
	const weight = Array.isArray(data.weight) ? data.weight.join(' ') : data.weight;
	const lines = [`font-family: "${family}"`, `src: ${src}`, 'font-display: swap'];

	if (weight !== undefined) lines.push(`font-weight: ${String(weight)}`);
	if (data.style) lines.push(`font-style: ${data.style}`);
	if (data.unicodeRange) lines.push(`unicode-range: ${data.unicodeRange.join(', ')}`);

	return `@font-face { ${lines.join('; ')}; }`;
}

function isProviderName(value: string): value is ProviderName {
	return Object.hasOwn(providerFactories, value);
}

function memoryStorage(): Storage {
	const store = new Map<string, unknown>();

	return {
		getItem: (key) => store.get(key),
		setItem: (key, value) => {
			store.set(key, value);
		},
	};
}
