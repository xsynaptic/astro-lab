import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { withAstroModules } from '../src/astro.js';
import { createCommandRunner } from '../src/command.js';

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
			const runner = { close: vi.fn() };

			runners.push(runner);

			return runner;
		}),
		runners,
		servers,
	};
});

vi.mock('vite', () => vite);
vi.mock('astro/config', () => ({ getViteConfig: () => () => Promise.resolve({}) }));

const originalArgv = process.argv;
const resolveNothing = () => Promise.resolve();
const originalOutput = process.env.SCRIPTS_OUTPUT;
let astroRoot: string;

beforeEach(() => {
	astroRoot = mkdtempSync(path.join(os.tmpdir(), 'astro-scripts-server-test-'));
	writeFileSync(path.join(astroRoot, 'astro.config.mjs'), '');
	writeFileSync(path.join(astroRoot, 'pnpm-workspace.yaml'), '');
	vi.spyOn(process, 'cwd').mockReturnValue(astroRoot);
	vi.spyOn(process.stdout, 'write').mockReturnValue(true);
	process.argv = ['node', 'script.ts'];
	process.env.SCRIPTS_OUTPUT = 'json';
	vite.servers.length = 0;
	vite.runners.length = 0;
	vite.createServer.mockClear();
});

afterEach(() => {
	vi.restoreAllMocks();
	rmSync(astroRoot, { force: true, recursive: true });
	process.argv = originalArgv;
	process.exitCode = undefined;

	if (originalOutput === undefined) {
		delete process.env.SCRIPTS_OUTPUT;
	} else {
		process.env.SCRIPTS_OUTPUT = originalOutput;
	}
});

describe('withAstroModules', () => {
	test('shares one server across a command and closes it when the command ends', async () => {
		const { runCommand } = createCommandRunner();
		let isOpenAfterCalls = false;

		await runCommand({
			name: 'probe',
			async run() {
				await withAstroModules(resolveNothing);
				await withAstroModules(resolveNothing);
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
				await Promise.all([withAstroModules(resolveNothing), withAstroModules(resolveNothing)]);
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
				await withAstroModules(() => Promise.reject(new Error('bad entry')));
			},
			summary: 'Probe',
			title: 'Probe',
		});

		expect(process.exitCode).toBe(1);
		expect(vite.servers[0]?.close).toHaveBeenCalledTimes(1);
	});

	test('outside a command, starts and closes a server per call', async () => {
		await withAstroModules(resolveNothing);
		await withAstroModules(resolveNothing);

		expect(vite.createServer).toHaveBeenCalledTimes(2);
		expect(vite.servers.every((server) => server.close.mock.calls.length === 1)).toBe(true);
	});
});
