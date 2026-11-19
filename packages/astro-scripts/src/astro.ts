import type * as AstroContentModule from 'astro:content';
import type { CollectionEntry, CollectionKey } from 'astro:content';
import type { ViteDevServer } from 'vite';
import type { ModuleRunner } from 'vite/module-runner';

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CommandScope } from './command.js';

import { importVite } from './astro-dependency.js';
import { getCommandScope } from './command.js';
import { findContentStore, findStaleFiles } from './content-store.js';
import { formatCount } from './output/format.js';
import { log } from './output/output.js';
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

const listedStaleFiles = 3;

async function warnIfStale(entries: Array<ContentEntry>) {
	const root = findAstroRoot();
	const staleFiles = await findStaleFiles(root, findContentStore(root), entries);

	if (staleFiles.length === 0) return;

	const listed = staleFiles.slice(0, listedStaleFiles).join(', ');
	const unlisted = staleFiles.length - listedStaleFiles;
	const more = unlisted > 0 ? ` and ${formatCount(unlisted)} more` : '';

	log.warn(`The content store predates changes to ${listed}${more}; run \`astro sync\``);
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
			`No entries found in: ${collections.join(', ')}. Check the collection names, or run \`astro sync\` if one is new.`,
		);
	}

	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- unsynced here, entries are the stub's `any`; a consumer's are typed
	await warnIfStale(flattened);

	return flattened;
}

export interface AstroPaths {
	cacheDir: string;
	clientDir: string;
	outDir: string;
}

function toDirectoryPath(url: URL) {
	return path.resolve(fileURLToPath(url));
}

// Astro exports no config resolver; an inline integration reads the resolved one
async function resolveAstroConfig() {
	// An unrooted config resolves against `process.cwd()`, finds none, and reads every collection back empty
	const root = findAstroRoot();
	const { getViteConfig } = await import('astro/config');
	const captured: { paths?: AstroPaths } = {};

	const viteConfig = await getViteConfig(
		{},
		{
			integrations: [
				{
					hooks: {
						'astro:config:done': ({ buildOutput, config }) => {
							const outDir = toDirectoryPath(config.outDir);

							captured.paths = {
								cacheDir: toDirectoryPath(config.cacheDir),
								clientDir: buildOutput === 'server' ? toDirectoryPath(config.build.client) : outDir,
								outDir,
							};
						},
					},
					name: '@xsynaptic/astro-scripts',
				},
			],
			logLevel: 'silent',
			root,
		},
	)({
		command: 'serve',
		mode: 'development',
	});

	if (captured.paths === undefined) {
		throw new Error('Astro resolved its config without running `astro:config:done`');
	}

	return { paths: captured.paths, viteConfig };
}

type ResolvedAstroConfig = Awaited<ReturnType<typeof resolveAstroConfig>>;

const commandConfigs = new WeakMap<CommandScope, Promise<ResolvedAstroConfig>>();

function getAstroConfig(scope: CommandScope | undefined) {
	if (!scope) return resolveAstroConfig();

	const existing = commandConfigs.get(scope);

	if (existing) return existing;

	const config = resolveAstroConfig();

	commandConfigs.set(scope, config);

	return config;
}

export async function getAstroPaths() {
	const { paths } = await getAstroConfig(getCommandScope());

	return paths;
}

async function startAstroServer(scope: CommandScope | undefined) {
	findContentStore(findAstroRoot());

	const [{ viteConfig }, { createLogger, createServer }] = await Promise.all([
		getAstroConfig(scope),
		importVite(),
	]);

	return createServer({
		...viteConfig,
		// Astro's config sets a `customLogger` that writes to stdout and ignores `logLevel`
		customLogger: createLogger('silent'),
		logLevel: 'silent',
		server: { hmr: false, middlewareMode: true, ws: false },
	});
}

const commandServers = new WeakMap<CommandScope, Promise<ViteDevServer>>();

function getCommandServer(scope: CommandScope) {
	const existing = commandServers.get(scope);

	if (existing) return existing;

	const server = startAstroServer(scope);

	commandServers.set(scope, server);
	scope.onEnd.push(async () => {
		let started: ViteDevServer;

		try {
			started = await server;
		} catch {
			return;
		}

		await started.close();
	});

	return server;
}

async function runInServer<T>(
	server: ViteDevServer,
	callback: (runner: ModuleRunner) => Promise<T>,
) {
	const { createServerModuleRunner } = await importVite();
	// Astro's store invalidation reaches only the environment's own runner, so a shared one would read stale content
	const runner = createServerModuleRunner(server.environments.ssr);

	try {
		return await callback(runner);
	} finally {
		await runner.close();
	}
}

async function withAstroModules<T>(callback: (runner: ModuleRunner) => Promise<T>) {
	const scope = getCommandScope();

	if (scope) return runInServer(await getCommandServer(scope), callback);

	const server = await startAstroServer(undefined);

	try {
		return await runInServer(server, callback);
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
