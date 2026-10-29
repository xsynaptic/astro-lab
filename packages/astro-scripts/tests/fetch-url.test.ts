import type { Server } from 'node:http';

import { createServer } from 'node:http';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { createCommandRunner } from '../src/command.js';
import { fetchUrl } from '../src/fetch-url.js';

let activeServer: Server | undefined;

async function startSilentServer() {
	const server = createServer();

	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', resolve);
	});

	const address = server.address();

	if (address === null || typeof address === 'string') throw new Error('Server has no port');

	activeServer = server;

	return `http://127.0.0.1:${String(address.port)}/`;
}

afterEach(() => {
	activeServer?.closeAllConnections();
	activeServer?.close();
	activeServer = undefined;
	vi.restoreAllMocks();
	process.exitCode = undefined;
});

describe('fetchUrl', () => {
	test('aborts an in-flight request when the command is interrupted', async () => {
		const url = await startSilentServer();
		const { runCommand } = createCommandRunner();
		const originalArgv = process.argv;
		let failure: unknown;

		vi.spyOn(process.stdout, 'write').mockReturnValue(true);
		process.argv = ['node', 'script.ts', '--json'];

		try {
			await runCommand({
				name: 'probe',
				async run() {
					const pending = fetchUrl(url, { retry: 0, timeout: false });

					process.emit('SIGINT');

					try {
						await pending;
					} catch (error) {
						failure = error;
					}
				},
				summary: 'Probe',
				title: 'Probe',
			});
		} finally {
			process.argv = originalArgv;
		}

		expect(failure).toHaveProperty('name', 'AbortError');
		expect(process.exitCode).toBe(130);
	});

	test("aborts on the caller's own signal inside a command", async () => {
		const url = await startSilentServer();
		const { runCommand } = createCommandRunner();
		const originalArgv = process.argv;
		const controller = new AbortController();
		let failure: unknown;

		vi.spyOn(process.stdout, 'write').mockReturnValue(true);
		process.argv = ['node', 'script.ts', '--json'];

		try {
			await runCommand({
				name: 'probe',
				async run() {
					const pending = fetchUrl(url, { signal: controller.signal, timeout: false });

					controller.abort();

					try {
						await pending;
					} catch (error) {
						failure = error;
					}
				},
				summary: 'Probe',
				title: 'Probe',
			});
		} finally {
			process.argv = originalArgv;
		}

		expect(failure).toHaveProperty('name', 'AbortError');
		expect(process.exitCode).toBeUndefined();
	});
});
