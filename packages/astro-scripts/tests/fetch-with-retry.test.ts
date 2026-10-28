import type { ServerResponse } from 'node:http';

import { createServer } from 'node:http';
import { afterEach, describe, expect, test } from 'vitest';

import { fetchWithRetry } from '../src/fetch-with-retry.js';

interface TestServer {
	close: () => void;
	requestCount: () => number;
	url: string;
}

const timeoutMs = 500;

let activeServer: TestServer | undefined;

async function startServer(
	respond?: (response: ServerResponse, requestNumber: number) => void,
): Promise<TestServer> {
	let requests = 0;

	const server = createServer((_request, response) => {
		requests += 1;
		respond?.(response, requests);
	});

	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', resolve);
	});

	const address = server.address();

	if (address === null || typeof address === 'string') throw new Error('Server has no port');

	activeServer = {
		close: () => {
			server.closeAllConnections();
			server.close();
		},
		requestCount: () => requests,
		url: `http://127.0.0.1:${String(address.port)}/`,
	};

	return activeServer;
}

afterEach(() => {
	activeServer?.close();
	activeServer = undefined;
});

describe('fetchWithRetry', () => {
	test('answers with the retry when only the first request times out', async () => {
		const server = await startServer((response, requestNumber) => {
			if (requestNumber > 1) response.end('ok');
		});

		const response = await fetchWithRetry(server.url, { label: 'document', timeoutMs });

		expect(response.status).toBe(200);
		expect(server.requestCount()).toBe(2);
	});

	test('names the check and keeps the timeout as the cause after a second timeout', async () => {
		const server = await startServer();
		const failure = fetchWithRetry(server.url, { label: 'document', timeoutMs });

		await expect(failure).rejects.toThrow(
			`document: no response within ${String(timeoutMs)}ms after a retry`,
		);
		await expect(failure).rejects.toHaveProperty('cause.name', 'TimeoutError');
		expect(server.requestCount()).toBe(2);
	});

	test('rethrows anything other than a timeout without retrying', async () => {
		const server = await startServer((response) => {
			response.socket?.destroy();
		});

		await expect(fetchWithRetry(server.url, { label: 'document', timeoutMs })).rejects.toThrow(
			TypeError,
		);
		expect(server.requestCount()).toBe(1);
	});
});
