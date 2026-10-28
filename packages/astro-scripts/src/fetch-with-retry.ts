interface FetchWithRetryOptions extends Omit<RequestInit, 'signal'> {
	label: string;
	timeoutMs: number;
}

function isTimeout(error: unknown) {
	return error instanceof DOMException && error.name === 'TimeoutError';
}

export async function fetchWithRetry(
	url: string,
	{ label, timeoutMs, ...init }: FetchWithRetryOptions,
): Promise<Response> {
	try {
		return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
	} catch (error) {
		if (!isTimeout(error)) throw error;
	}

	try {
		return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
	} catch (error) {
		throw new Error(`${label}: no response within ${String(timeoutMs)}ms after a retry`, {
			cause: error,
		});
	}
}
