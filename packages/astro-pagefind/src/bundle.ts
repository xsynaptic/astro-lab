import { getPagefindVersion } from './package-version.js';

declare const __XSYNAPTIC_PAGEFIND_VERSION__: string | undefined;

// The integration defines the version for site code, so a server bundle never needs Pagefind at runtime
function getVersion() {
	if (typeof __XSYNAPTIC_PAGEFIND_VERSION__ === 'string') return __XSYNAPTIC_PAGEFIND_VERSION__;

	return getPagefindVersion();
}

// Versioned so an upgrade changes the URL of the fixed-name files a long-lived cache would keep serving
export function getBundleDir() {
	return `pagefind/${getVersion()}/`;
}

export function getBundlePath(base: string) {
	const baseWithSlash = base.endsWith('/') ? base : `${base}/`;

	return `${baseWithSlash}${getBundleDir()}`;
}
