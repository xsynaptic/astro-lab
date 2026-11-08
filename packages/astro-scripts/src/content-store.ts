import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { ContentEntry } from './astro.js';

import { importFromAstro } from './astro-dependency.js';
import { UserError } from './user-error.js';

interface XXHashModule {
	default: () => Promise<{ h64ToString: (input: string) => string }>;
}

// Dev mode reads the store from `.astro/`, ignoring `cacheDir`
const storeFiles = ['.astro/data-store.json', '.astro/data-store/manifest.json'];

export function findContentStore(root: string) {
	const storePath = storeFiles
		.map((file) => path.join(root, file))
		.find((filePath) => existsSync(filePath));

	if (storePath === undefined) {
		throw new UserError(
			`No content store in ${path.join(root, '.astro')}; run \`astro sync\`, and set \`cacheDir: './.astro/'\` in the Astro config so it lands there.`,
		);
	}

	return storePath;
}

async function createDigest() {
	const { default: xxhash } = await importFromAstro<XXHashModule>('xxhash-wasm');
	const { h64ToString } = await xxhash();

	return h64ToString;
}

// Sync skips the write when no digest changed, so a newer file only counts as stale if its contents did
export async function findStaleFiles(
	root: string,
	storePath: string,
	entries: Array<Pick<ContentEntry, 'digest' | 'filePath'>>,
) {
	const storeTime = statSync(storePath).mtimeMs;
	const staleFiles = new Set<string>();
	const newerEntries: Array<{ digest: ContentEntry['digest']; filePath: string }> = [];

	for (const { digest, filePath } of entries) {
		if (filePath === undefined) continue;

		const stats = statSync(path.resolve(root, filePath), { throwIfNoEntry: false });

		if (stats === undefined) {
			staleFiles.add(filePath);
			continue;
		}

		if (stats.mtimeMs > storeTime) newerEntries.push({ digest, filePath });
	}

	if (newerEntries.length === 0) return [...staleFiles];

	const digestOf = await createDigest();
	const fileDigests = new Map<string, string>();

	for (const { digest, filePath } of newerEntries) {
		const fileDigest =
			fileDigests.get(filePath) ?? digestOf(readFileSync(path.resolve(root, filePath), 'utf8'));

		fileDigests.set(filePath, fileDigest);

		if (fileDigest !== digest) staleFiles.add(filePath);
	}

	return [...staleFiles];
}
