export interface SitemapLastmodFile {
	generatedAt: string;
	urls: Record<string, string>;
}

// Takes a pathname or a full URL; parsing percent-encodes the path the way the sitemap's own URLs are
// `@astrojs/sitemap` appends a slash unless `trailingSlash` is `'never'`, so keys never carry one
export function normalizePathname(value: string) {
	const { pathname } = new URL(value, 'http://localhost');

	if (pathname === '/' || !pathname.endsWith('/')) return pathname;

	return pathname.slice(0, -1);
}
