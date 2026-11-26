import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { getAstroPaths, withAstroContent } from '../../src/astro.js';
import { createCommandRunner } from '../../src/command.js';

const vite = vi.hoisted(() => {
	const servers: Array<{ close: ReturnType<typeof vi.fn> }> = [];
	const runners: Array<{ close: ReturnType<typeof vi.fn> }> = [];

	return {
		createLogger: vi.fn(),
		createServer: vi.fn(() => {
			const server = { close: vi.fn(), environments: { ssr: {} } };

			servers.push(server);

			return Promise.resolve(server);
		}),
		createServerModuleRunner: vi.fn(() => {
			const runner = { close: vi.fn(), import: vi.fn(() => Promise.resolve({})) };

			runners.push(runner);

			return runner;
		}),
		runners,
		servers,
	};
});

vi.mock('../../src/astro-dependency.js', () => ({ importVite: () => Promise.resolve(vite) }));
const astroConfig = vi.hoisted(() => {
	interface InlineConfig {
		integrations: Array<{ hooks: { 'astro:config:done': (options: unknown) => void } }>;
	}

	return {
		getViteConfig: vi.fn((_vite: unknown, { integrations }: InlineConfig) => () => {
			const config = {
				build: { client: new URL('file:///site/dist/client/') },
				cacheDir: new URL('file:///site/node_modules/.astro/'),
				outDir: new URL('file:///site/dist/'),
			};

			for (const integration of integrations) {
				integration.hooks['astro:config:done']({ buildOutput: 'static', config });
			}

			return Promise.resolve({});
		}),
	};
});

vi.mock('astro/config', () => astroConfig);

const originalArgv = process.argv;
const resolveNothing = () => Promise.resolve();
const originalOutput = process.env.XSYNAPTIC_SCRIPTS_OUTPUT;
let astroRoot: string;

beforeEach(() => {
	astroRoot = mkdtempSync(path.join(os.tmpdir(), 'astro-scripts-server-test-'));
	writeFileSync(path.join(astroRoot, 'astro.config.mjs'), '');
	writeFileSync(path.join(astroRoot, 'pnpm-workspace.yaml'), '');
	mkdirSync(path.join(astroRoot, '.astro'));
	writeFileSync(path.join(astroRoot, '.astro/data-store.json'), '[]');
	vi.spyOn(process, 'cwd').mockReturnValue(astroRoot);
	vi.spyOn(process.stdout, 'write').mockReturnValue(true);
	process.argv = ['node', 'script.ts'];
	process.env.XSYNAPTIC_SCRIPTS_OUTPUT = 'json';
	vite.servers.length = 0;
	vite.runners.length = 0;
	vite.createServer.mockClear();
	astroConfig.getViteConfig.mockClear();
});

afterEach(() => {
	vi.restoreAllMocks();
	rmSync(astroRoot, { force: true, recursive: true });
	process.argv = originalArgv;
	process.exitCode = undefined;

	if (originalOutput === undefined) {
		delete process.env.XSYNAPTIC_SCRIPTS_OUTPUT;
	} else {
		process.env.XSYNAPTIC_SCRIPTS_OUTPUT = originalOutput;
	}
});

describe('withAstroContent', () => {
	test('shares one server across a command and closes it when the command ends', async () => {
		const { runCommand } = createCommandRunner();
		let isOpenAfterCalls = false;

		await runCommand({
			name: 'probe',
			async run() {
				await withAstroContent(resolveNothing);
				await withAstroContent(resolveNothing);
				isOpenAfterCalls = vite.servers.every((server) => server.close.mock.calls.length === 0);
			},
			summary: 'Probe',
			title: 'Probe',
		});

		expect(process.exitCode).toBeUndefined();
		expect(vite.createServer).toHaveBeenCalledTimes(1);
		expect(isOpenAfterCalls).toBe(true);
		expect(vite.servers[0]?.close).toHaveBeenCalledTimes(1);
		expect(vite.runners).toHaveLength(2);
		expect(vite.runners.every((runner) => runner.close.mock.calls.length === 1)).toBe(true);
	});

	test('starts one server for calls a command makes at once', async () => {
		const { runCommand } = createCommandRunner();

		await runCommand({
			name: 'probe',
			async run() {
				await Promise.all([withAstroContent(resolveNothing), withAstroContent(resolveNothing)]);
			},
			summary: 'Probe',
			title: 'Probe',
		});

		expect(vite.createServer).toHaveBeenCalledTimes(1);
	});

	test('closes the shared server when the command fails', async () => {
		const { runCommand } = createCommandRunner();

		await runCommand({
			name: 'probe',
			async run() {
				await withAstroContent(() => Promise.reject(new Error('bad entry')));
			},
			summary: 'Probe',
			title: 'Probe',
		});

		expect(process.exitCode).toBe(1);
		expect(vite.servers[0]?.close).toHaveBeenCalledTimes(1);
	});

	test('outside a command, starts and closes a server per call', async () => {
		await withAstroContent(resolveNothing);
		await withAstroContent(resolveNothing);

		expect(vite.createServer).toHaveBeenCalledTimes(2);
		expect(vite.servers.every((server) => server.close.mock.calls.length === 1)).toBe(true);
	});
});

describe('getAstroPaths', () => {
	test('resolves the config once for a command that reads paths and content', async () => {
		const { runCommand } = createCommandRunner();

		await runCommand({
			name: 'probe',
			async run() {
				await getAstroPaths();
				await withAstroContent(resolveNothing);
				await getAstroPaths();
			},
			summary: 'Probe',
			title: 'Probe',
		});

		expect(process.exitCode).toBeUndefined();
		expect(astroConfig.getViteConfig).toHaveBeenCalledTimes(1);
	});

	test('outside a command, resolves the config on each call', async () => {
		await getAstroPaths();
		await getAstroPaths();

		expect(astroConfig.getViteConfig).toHaveBeenCalledTimes(2);
	});

	test('needs no content store', async () => {
		rmSync(path.join(astroRoot, '.astro'), { recursive: true });

		await expect(getAstroPaths()).resolves.toMatchObject({ outDir: '/site/dist' });
	});
});
