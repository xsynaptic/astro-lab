import { describe, expect, test } from 'vitest';

import { formatError } from '../../src/output/format.js';

class ChainError extends Error {}

describe('formatError', () => {
	test("keeps the reason Node's fetch hides in `cause`, not only `fetch failed`", () => {
		const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });

		expect(formatError(new TypeError('fetch failed', { cause: reset }))).toBe(
			'fetch failed: read ECONNRESET',
		);
	});

	test('stops on a cause that points back up the chain', () => {
		const outer = new ChainError('outer');

		outer.cause = new ChainError('inner', { cause: outer });

		expect(formatError(outer)).toBe('outer: inner');
	});

	test('drops a wrapper that repeats the message it wraps', () => {
		expect(formatError(new Error('disk full', { cause: new Error('disk full') }))).toBe(
			'disk full',
		);
	});

	test('reads a thrown value that is not an Error', () => {
		expect(formatError('no route')).toBe('no route');
		expect(formatError(new Error('wrapped', { cause: 404 }))).toBe('wrapped: 404');
	});
});
