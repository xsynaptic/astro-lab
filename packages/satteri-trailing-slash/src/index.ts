import { defineHastPlugin } from 'satteri';
import { z } from 'zod';

const optionsSchema = z.object({
	trailingSlash: z.enum(['always', 'never', 'ignore']).default('ignore'),
});

type TrailingSlashOptions = z.input<typeof optionsSchema>;

export function trailingSlash(options?: null | Readonly<TrailingSlashOptions>) {
	const settings = optionsSchema.parse(options ?? {});

	return defineHastPlugin({
		element: {
			filter: ['a'],
			visit(node, ctx) {
				if (settings.trailingSlash === 'ignore') return;

				const href = node.properties.href;
				if (typeof href !== 'string') return;

				const next = normalizeHref(href, settings.trailingSlash);
				if (next !== undefined) ctx.setProperty(node, 'href', next);
			},
		},
		name: 'trailing-slash',
	});
}

// Returns undefined when nothing should change, so the visitor skips the write
function normalizeHref(href: string, mode: 'always' | 'never'): string | undefined {
	if (!href.startsWith('/') || href.startsWith('//')) return undefined; // internal root-relative only

	const suffixMarkers = [href.indexOf('?'), href.indexOf('#')].filter((index) => index !== -1);
	const cut = suffixMarkers.length === 0 ? -1 : Math.min(...suffixMarkers);
	const path = cut === -1 ? href : href.slice(0, cut);

	if (path === '/') return undefined; // root is canonical in both modes

	const suffix = cut === -1 ? '' : href.slice(cut);

	if (mode === 'always') {
		const lastSegment = path.slice(path.lastIndexOf('/') + 1);
		if (path.endsWith('/') || lastSegment.includes('.')) return undefined; // already slashed, or a file
		return `${path}/${suffix}`;
	}

	if (!path.endsWith('/')) return undefined; // 'never': nothing to strip
	return `${path.slice(0, -1)}${suffix}`;
}

export { normalizeHref };
export type { TrailingSlashOptions };
