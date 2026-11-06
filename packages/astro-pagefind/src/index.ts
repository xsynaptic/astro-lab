import type { AstroIntegration } from 'astro';

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIndex } from 'pagefind';
import sirv from 'sirv';

import type { PagefindOptions } from './options.js';

import { getBundleDir } from './bundle.js';
import { formatUnknownKeysWarning, parseOptions } from './options.js';
import { findPackageVersion, getPagefindVersion, versionDefine } from './package-version.js';

export type { PagefindOptions } from './options.js';

function throwOnErrors(errors: Array<string>, action: string) {
	if (errors.length === 0) return;

	throw new Error(`Pagefind failed to ${action}: ${errors.join(', ')}`);
}

// The component UI reads the indexer's output format, which changes between releases
function assertMatchingComponentUi(root: URL) {
	const componentUiVersion = findPackageVersion('@pagefind/component-ui', root);

	if (componentUiVersion === undefined) return;

	const pagefindVersion = getPagefindVersion();

	if (componentUiVersion === pagefindVersion) return;

	throw new Error(
		`pagefind ${pagefindVersion} and @pagefind/component-ui ${componentUiVersion} must be the same version`,
	);
}

export default function pagefind(options?: PagefindOptions): AstroIntegration {
	const { indexConfig, unknownKeys } = parseOptions(options, getPagefindVersion);
	let serveDirectories: Array<string> = [];

	return {
		hooks: {
			'astro:build:done': async ({ dir, logger }) => {
				const { errors: setupErrors, index } = await createIndex(indexConfig);

				throwOnErrors(setupErrors, 'create an index');

				if (!index) throw new Error('Pagefind failed to create an index');

				const distPath = fileURLToPath(dir);
				const { errors: indexErrors, page_count } = await index.addDirectory({ path: distPath });

				throwOnErrors(indexErrors, 'index files');

				if (page_count === 0) {
					throw new Error(
						`Pagefind found no pages to index in ${distPath}, so search would return nothing`,
					);
				}

				const { errors: writeErrors, outputPath } = await index.writeFiles({
					outputPath: path.join(distPath, getBundleDir()),
				});

				throwOnErrors(writeErrors, 'write the bundle');

				logger.info(`Indexed ${String(page_count)} pages to ${outputPath}`);
			},
			'astro:config:done': ({ config }) => {
				const outDir = fileURLToPath(config.outDir);

				serveDirectories = config.adapter ? [fileURLToPath(config.build.client), outDir] : [outDir];
			},
			'astro:config:setup': ({ config, logger, updateConfig }) => {
				assertMatchingComponentUi(config.root);

				if (unknownKeys.length > 0) {
					logger.warn(formatUnknownKeysWarning(unknownKeys, getPagefindVersion()));
				}

				if (config.output === 'server') {
					logger.warn(
						"With output: 'server', only pages that opt into prerendering are indexed for search",
					);
				}

				updateConfig({
					vite: { define: { [versionDefine]: JSON.stringify(getPagefindVersion()) } },
				});
			},
			'astro:server:setup': ({ logger, server }) => {
				const bundleDir = getBundleDir();
				const hasBuild = serveDirectories.some((directory) =>
					existsSync(path.join(directory, bundleDir, 'pagefind.js')),
				);

				if (!hasBuild) logger.warn(`No ${bundleDir} in the last build; search needs a rebuild`);

				// Mounted on each candidate in turn, since dev can't tell which directory the next build writes to
				for (const directory of serveDirectories) {
					// Astro strips `base` before any integration middleware sees the request
					server.middlewares.use(
						`/${bundleDir}`,
						sirv(path.join(directory, bundleDir), { dev: true, etag: true }),
					);
				}
			},
		},
		name: '@xsynaptic/astro-pagefind',
	};
}
