import { getCommandSignal } from './command.js';

interface FetchWithRetryOptions extends Omit<RequestInit, 'signal'> {
	label: string;
	signal?: AbortSignal;
	timeoutMs: number;
}

function isTimeout(error: unknown) {
	return error instanceof DOMException && error.name === 'TimeoutError';
}

function isNetworkFailure(error: unknown): error is TypeError {
	return error instanceof TypeError && error.message === 'fetch failed';
}

function getAttemptSignal(timeoutMs: number, signal: AbortSignal | undefined) {
	const timeout = AbortSignal.timeout(timeoutMs);

	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function describeFailure(error: TypeError) {
	return error.cause instanceof Error ? `fetch failed (${error.cause.message})` : 'fetch failed';
}

export async function fetchWithRetry(
	url: string,
	{ label, signal = getCommandSignal(), timeoutMs, ...init }: FetchWithRetryOptions,
): Promise<Response> {
	try {
		return await fetch(url, { ...init, signal: getAttemptSignal(timeoutMs, signal) });
	} catch (error) {
		if (!isTimeout(error) && !isNetworkFailure(error)) throw error;
	}

	try {
		return await fetch(url, { ...init, signal: getAttemptSignal(timeoutMs, signal) });
	} catch (error) {
		if (isTimeout(error)) {
			throw new Error(`${label}: no response within ${String(timeoutMs)}ms after a retry`, {
				cause: error,
			});
		}

		if (isNetworkFailure(error)) {
			throw new Error(`${label}: ${describeFailure(error)} after a retry`, { cause: error });
		}

		throw error;
	}
}
