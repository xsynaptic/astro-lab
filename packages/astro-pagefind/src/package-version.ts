interface PackageJson {
	version: string;
}

// Neither Pagefind package exports its package.json
export function findPackageVersion(packageName: string, base: string | URL) {
	// Loaded on call so a server bundle reading the injected version carries no Node imports
	const { findPackageJSON } = process.getBuiltinModule('node:module');
	const { readFileSync } = process.getBuiltinModule('node:fs');
	let packageJsonPath: string | undefined;

	try {
		packageJsonPath = findPackageJSON(packageName, base);
	} catch {
		return;
	}

	if (packageJsonPath === undefined) return;

	const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJson;

	return packageJson.version;
}

// Must match the identifier `bundle.ts` reads, since Vite replaces it as written
export const versionDefine = '__XSYNAPTIC_PAGEFIND_VERSION__';

let pagefindVersion: string | undefined;

export function getPagefindVersion() {
	if (pagefindVersion !== undefined) return pagefindVersion;

	const version = findPackageVersion('pagefind', import.meta.url);

	if (version === undefined) {
		throw new Error("Can't find pagefind; install it alongside this package");
	}

	pagefindVersion = version;

	return version;
}
