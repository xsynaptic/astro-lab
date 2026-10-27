import type * as AstroContentModule from 'astro:content';
import type { CollectionEntry, CollectionKey } from 'astro:content';
import type { ModuleRunner } from 'vite/module-runner';

import { existsSync } from 'node:fs';
import path from 'node:path';

import { UserError } from './user-error.js';

type AstroContent = typeof AstroContentModule;

// Mirrors Astro's own `configPaths`; it does not accept the CommonJS variants
const configFilenames = [
	'astro.config.mjs',
	'astro.config.js',
	'astro.config.ts',
	'astro.config.mts',
];

// Every `CollectionEntry` must satisfy this
export interface ContentEntry {
	body?: string | undefined;
	collection: string;
	data: Record<string, unknown>;
	// Astro widens this to `string | number`; file-based collections only ever write a string
	digest?: number | string | undefined;
	filePath?: string | undefined;
	id: string;
}

export function findAstroRoot(startDir = process.cwd()) {
	let current = path.resolve(startDir);

	while (current !== path.dirname(current)) {
		const hasConfig = configFilenames.some((filename) => existsSync(path.join(current, filename)));

		if (hasConfig) return current;

		current = path.dirname(current);
	}

	throw new UserError(`Could not locate an Astro config above ${startDir}`);
}

// Annotated so the declaration keeps the consumer's `CollectionEntry`; inferred, it bakes in the unsynced `any`
export async function getCollectionEntries<C extends CollectionKey>(
	{ getCollection }: AstroContent,
	collections: Array<C>,
): Promise<Array<CollectionEntry<C>>> {
	const entries = await Promise.all(
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return -- unsynced here, `getCollection` is the stub's `any`; a consumer's is typed
		collections.map((collection) => getCollection(collection)),
	);
	const flattened = entries.flat();

	if (flattened.length === 0) {
		throw new UserError(
			`No entries found in: ${collections.join(', ')}. Run \`astro sync\` to write the content store.`,
		);
	}

	return flattened;
}

export async function withAstroModules<T>(callback: (runner: ModuleRunner) => Promise<T>) {
	// An unrooted config resolves against `process.cwd()`, finds none, and reads every collection back empty
	const root = findAstroRoot();
	const [{ getViteConfig }, { createLogger, createServer, createServerModuleRunner }] =
		await Promise.all([import('astro/config'), import('vite')]);

	const config = await getViteConfig(
		{},
		{ logLevel: 'silent', root },
	)({
		command: 'serve',
		mode: 'development',
	});

	const server = await createServer({
		...config,
		// Astro's config sets a `customLogger` that writes to stdout and ignores `logLevel`
		customLogger: createLogger('silent'),
		logLevel: 'silent',
		server: { hmr: false, middlewareMode: true, ws: false },
	});

	try {
		return await callback(createServerModuleRunner(server.environments.ssr));
	} finally {
		// The process hangs on the open server otherwise
		await server.close();
	}
}

export async function withAstroContent<T>(callback: (content: AstroContent) => Promise<T>) {
	return withAstroModules(async (runner) =>
		callback(await runner.import<AstroContent>('astro:content')),
	);
}
