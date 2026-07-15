import { describe, expect, it, vi } from 'vitest';

import type { ProviderName } from '../src/shared/types.js';

import { memoizeByProviders } from '../src/server/provider-cache.js';

describe('memoizeByProviders', () => {
	it('shares one promise for the same set regardless of order', () => {
		const factory = vi.fn((providers: Array<ProviderName>) => Promise.resolve(providers.join(',')));
		const memo = memoizeByProviders(factory);

		const first = memo(['google', 'fontsource']);
		const second = memo(['fontsource', 'google']);

		expect(first).toBe(second);
		expect(factory).toHaveBeenCalledTimes(1);
	});

	it('keeps a resolved entry cached', async () => {
		const factory = vi.fn(() => Promise.resolve('ok'));
		const memo = memoizeByProviders(factory);

		await memo(['google']);
		await memo(['google']);

		expect(factory).toHaveBeenCalledTimes(1);
	});

	it('evicts on rejection so the next call retries instead of replaying the failure', async () => {
		let attempt = 0;
		const factory = vi.fn(() => {
			attempt += 1;

			return attempt === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('ok');
		});
		const memo = memoizeByProviders(factory);

		await expect(memo(['google'])).rejects.toThrow('boom');
		await expect(memo(['google'])).resolves.toBe('ok');
		expect(factory).toHaveBeenCalledTimes(2);
	});
});
