const selfContainedUrl = /^(?:[a-z][\d+.a-z-]*:|\/\/|#)/i;

export function resolveUrl(value: string, site: URL) {
	if (value === '' || selfContainedUrl.test(value)) return value;

	return URL.parse(value, site)?.href ?? value;
}
