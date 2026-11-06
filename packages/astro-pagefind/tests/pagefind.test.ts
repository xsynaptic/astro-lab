import type { AstroIntegration } from 'astro';

import { build, dev } from 'astro';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { close } from 'pagefind';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { getBundleDir, getBundlePath } from '../src/bundle.js';
import pagefind from '../src/index.js';

type Hooks = AstroIntegration['hooks'];

interface ConfigOverrides {
	adapter?: boolean;
	output?: 'server' | 'static';
}

const pages = {
	'index.html': '<h1>Coastline notes</h1><p>Short pages about the shore.</p>',
	'lighthouses/index.html': '<h1>Lighthouses</h1><p>The keeper trimmed the lantern wick.</p>',
	'tide-pools/index.html': '<h1>Tide pools</h1><p>Anemone colonies fill the rock shelf.</p>',
};

let root: string;

function createDevAdapter(): AstroIntegration {
	return {
		hooks: {
			'astro:config:done': ({ setAdapter }) => {
				setAdapter({
					adapterFeatures: { buildOutput: 'server' },
					name: 'test-adapter',
					serverEntrypoint: 'test-adapter/server',
					supportedAstroFeatures: { serverOutput: 'stable' },
				});
			},
		},
		name: 'test-adapter',
	};
}

async function withDevServer(
	options: { adapter?: boolean; base: string },
	run: (bundleUrl: string) => Promise<void>,
) {
	// Astro skips its dev middleware under Vitest, and with it the handling that strips `base`
	vi.stubEnv('VITEST', undefined);

	const devServer = await dev({
		base: options.base,
		integrations: [pagefind()],
		logLevel: 'silent',
		outDir: './dist',
		root,
		server: { port: 0 },
		...(options.adapter === true ? { adapter: createDevAdapter() } : {}),
	});

	try {
		await run(`http://localhost:${String(devServer.address.port)}${getBundlePath(options.base)}`);
	} finally {
		await devServer.stop();
		vi.unstubAllEnvs();
	}
}

async function fetchMarker(bundleUrl: string) {
	const response = await fetch(`${bundleUrl}pagefind.js`);

	return { body: await response.text(), status: response.status };
}

async function fetchBundle(options: { adapter?: boolean; base: string }) {
	let result: Awaited<ReturnType<typeof fetchMarker>> | undefined;

	await withDevServer(options, async (bundleUrl) => {
		result = await fetchMarker(bundleUrl);
	});

	return result;
}

function createLogger() {
	return { info: vi.fn<(message: string) => void>(), warn: vi.fn<(message: string) => void>() };
}

function directoryUrl(directory: string) {
	return pathToFileURL(`${directory}/`);
}

function runConfigHooks(integration: AstroIntegration, overrides: ConfigOverrides = {}) {
	type ConfigSetupParams = Parameters<NonNullable<Hooks['astro:config:setup']>>[0];
	type ConfigDoneParams = Parameters<NonNullable<Hooks['astro:config:done']>>[0];
	const logger = createLogger();
	const config = {
		adapter: overrides.adapter === true ? { hooks: {}, name: 'test-adapter' } : undefined,
		base: '/',
		build: { client: directoryUrl(path.join(root, 'dist', 'client')) },
		outDir: directoryUrl(path.join(root, 'dist')),
		output: overrides.output ?? 'static',
		root: directoryUrl(root),
	};

	integration.hooks['astro:config:setup']?.({
		config,
		logger,
		updateConfig: vi.fn(),
	} as unknown as ConfigSetupParams);
	integration.hooks['astro:config:done']?.({ config, logger } as unknown as ConfigDoneParams);

	return logger;
}

async function runBuildDone(integration: AstroIntegration, directory: string) {
	type BuildDoneParams = Parameters<NonNullable<Hooks['astro:build:done']>>[0];
	const logger = createLogger();

	await integration.hooks['astro:build:done']?.({
		dir: directoryUrl(directory),
		logger,
	} as unknown as BuildDoneParams);

	return logger;
}

async function writePages(directory: string) {
	for (const [file, body] of Object.entries(pages)) {
		const filePath = path.join(directory, file);

		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, `<!doctype html><html lang="en"><body>${body}</body></html>`);
	}
}

async function writeComponentUi(version: string) {
	const packageDir = path.join(root, 'node_modules', '@pagefind', 'component-ui');

	await fs.mkdir(packageDir, { recursive: true });
	await fs.writeFile(path.join(packageDir, 'index.js'), 'export {};');
	await fs.writeFile(
		path.join(packageDir, 'package.json'),
		JSON.stringify({ exports: { '.': './index.js' }, name: '@pagefind/component-ui', version }),
	);
}

async function writeBundleMarker(directory: string, marker: string) {
	const bundleDir = path.join(directory, getBundleDir());

	await fs.mkdir(bundleDir, { recursive: true });
	await fs.writeFile(path.join(bundleDir, 'pagefind.js'), marker);
}

function pagefindVersion() {
	return getBundleDir().split('/', 2)[1];
}

async function readEntryVersion(bundleDir: string) {
	const entry = JSON.parse(
		await fs.readFile(path.join(bundleDir, 'pagefind-entry.json'), 'utf8'),
	) as { version: string };

	return entry.version;
}

beforeEach(async () => {
	root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'astro-pagefind-')));
});

afterAll(async () => {
	await close();
});

describe('bundle path', () => {
	test.each(['/lab', '/lab/'])('base %s gets one slash before the bundle directory', (base) => {
		expect(getBundlePath(base)).toBe(`/lab/pagefind/${String(pagefindVersion())}/`);
	});

	test('the root base keeps the bundle at the top level', () => {
		expect(getBundlePath('/')).toBe(`/pagefind/${String(pagefindVersion())}/`);
	});
});

describe('build', () => {
	test('indexes every page into a directory named for the version the indexer reports', async () => {
		const dist = path.join(root, 'dist');
		const integration = pagefind();

		await writePages(dist);
		runConfigHooks(integration);
		const logger = await runBuildDone(integration, dist);
		const [versionDir] = await fs.readdir(path.join(dist, 'pagefind'));

		expect(versionDir).toBe(
			await readEntryVersion(path.join(dist, 'pagefind', String(versionDir))),
		);
		expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/^Indexed 3 pages to /));
	});

	test('an empty index fails the build', async () => {
		const dist = path.join(root, 'dist');
		const integration = pagefind();

		await fs.mkdir(dist, { recursive: true });
		runConfigHooks(integration);

		await expect(runBuildDone(integration, dist)).rejects.toThrow('found no pages to index');
	});

	test('the built page points at the bundle the build wrote', async () => {
		const outDir = path.join(root, 'dist');

		await build({
			integrations: [pagefind()],
			logLevel: 'silent',
			outDir,
			root: fileURLToPath(new URL('fixtures/site/', import.meta.url)),
			// With outDir outside the cwd, Astro writes prerender chunks under the cwd, where an external zod doesn't resolve
			vite: { environments: { prerender: { resolve: { noExternal: ['zod'] } } } },
		});

		const html = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
		const [versionDir] = await fs.readdir(path.join(outDir, 'pagefind'));

		expect(html).toContain(`bundle-path="/pagefind/${String(versionDir)}/"`);
		expect(versionDir).toBe(
			await readEntryVersion(path.join(outDir, 'pagefind', String(versionDir))),
		);
	});

	test('passes indexConfig through to the indexer', async () => {
		const dist = path.join(root, 'dist');
		const integration = pagefind({ indexConfig: { forceLanguage: 'fr' } });

		await writePages(dist);
		runConfigHooks(integration);
		await runBuildDone(integration, dist);

		const files = await fs.readdir(path.join(dist, getBundleDir()));

		expect(files).toContain('wasm.fr.pagefind');
		expect(files).not.toContain('wasm.en.pagefind');
	});
});

describe('options', () => {
	test('a key the installed Pagefind drops fails when the config loads', () => {
		// @ts-expect-error the installed Pagefind's types catch this in a typed config
		expect(() => pagefind({ indexConfig: { excludeSelector: ['nav'] } })).toThrow(
			`Pagefind ${String(pagefindVersion())} ignores indexConfig keys it doesn't know: excludeSelector`,
		);
	});
});

describe('component UI version', () => {
	test('a component UI from another release fails setup', async () => {
		await writeComponentUi('1.0.0');

		expect(() => runConfigHooks(pagefind())).toThrow(
			`pagefind ${String(pagefindVersion())} and @pagefind/component-ui 1.0.0 must be the same version`,
		);
	});

	test('a matching component UI passes', async () => {
		await writeComponentUi(String(pagefindVersion()));

		expect(() => runConfigHooks(pagefind())).not.toThrow();
	});

	test('a site without the component UI passes', () => {
		expect(() => runConfigHooks(pagefind())).not.toThrow();
	});
});

describe('dev server', () => {
	test('serves the last build under a base', async () => {
		await writeBundleMarker(path.join(root, 'dist'), 'from outDir');

		expect(await fetchBundle({ base: '/lab' })).toEqual({ body: 'from outDir', status: 200 });
	});

	test('serves the client directory when an adapter build wrote the bundle there', async () => {
		await writeBundleMarker(path.join(root, 'dist', 'client'), 'from client');

		expect(await fetchBundle({ adapter: true, base: '/' })).toEqual({
			body: 'from client',
			status: 200,
		});
	});

	test('serves outDir when a static-output adapter wrote the bundle there', async () => {
		await writeBundleMarker(path.join(root, 'dist'), 'from outDir');

		expect(await fetchBundle({ adapter: true, base: '/' })).toEqual({
			body: 'from outDir',
			status: 200,
		});
	});

	test('picks up an adapter build written after dev started', async () => {
		await withDevServer({ adapter: true, base: '/' }, async (bundleUrl) => {
			await writeBundleMarker(path.join(root, 'dist', 'client'), 'from client');

			expect(await fetchMarker(bundleUrl)).toEqual({ body: 'from client', status: 200 });
		});
	});

	test('warns when no build has written a bundle', () => {
		type ServerSetupParams = Parameters<NonNullable<Hooks['astro:server:setup']>>[0];
		const integration = pagefind();
		const logger = createLogger();

		runConfigHooks(integration);
		integration.hooks['astro:server:setup']?.({
			logger,
			server: { middlewares: { use: vi.fn() } },
		} as unknown as ServerSetupParams);

		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('needs a rebuild'));
	});
});

describe('server output', () => {
	test('warns that only prerendered pages are indexed', () => {
		const logger = runConfigHooks(pagefind(), { output: 'server' });

		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('opt into prerendering'));
	});
});
