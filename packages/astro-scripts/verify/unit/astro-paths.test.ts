import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { getAstroPaths } from '../../src/astro.js';

const astroPackagePath = path.dirname(createRequire(import.meta.url).resolve('astro/package.json'));

const staticConfig = `export default {
	outDir: './build',
	integrations: [
		{
			name: 'site',
			hooks: {
				'astro:config:setup': ({ config, updateConfig }) => {
					updateConfig({ cacheDir: new URL('./site-cache/', config.root) });
				},
			},
		},
	],
};
`;

const serverConfig = `const adapter = {
	name: 'stub-adapter',
	hooks: {
		'astro:config:done': ({ setAdapter }) => {
			setAdapter({ name: 'stub-adapter', supportedAstroFeatures: { serverOutput: 'stable' } });
		},
	},
};

export default {
	adapter,
	build: { client: './public-files/' },
	output: 'server',
};
`;

let root: string;

async function createProject(config: string) {
	root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'astro-scripts-paths-')));

	await mkdir(path.join(root, 'node_modules'));
	await symlink(astroPackagePath, path.join(root, 'node_modules/astro'), 'dir');
	await writeFile(path.join(root, 'astro.config.mjs'), config);
	vi.spyOn(process, 'cwd').mockReturnValue(root);
}

afterEach(async () => {
	vi.restoreAllMocks();
	await rm(root, { force: true, recursive: true });
});

describe('getAstroPaths against a real Astro project', () => {
	test('static output lands in `outDir`, with site integrations still applied', async () => {
		await createProject(staticConfig);

		await expect(getAstroPaths()).resolves.toEqual({
			cacheDir: path.join(root, 'site-cache'),
			clientDir: path.join(root, 'build'),
			outDir: path.join(root, 'build'),
		});
	});

	test('server output lands in `build.client`', async () => {
		await createProject(serverConfig);

		const paths = await getAstroPaths();

		expect(paths.outDir).toBe(path.join(root, 'dist'));
		expect(paths.clientDir).toBe(path.join(root, 'dist/public-files'));
	});
});
