import type { ProviderName } from '../shared/types.js';

// Memoize a promise keyed by the provider set
// If the promise rejects, the entry is evicted so the next call retries instead of replaying the cached failure
export function memoizeByProviders<T>(
	factory: (providers: Array<ProviderName>) => Promise<T>,
): (providers: Array<ProviderName>) => Promise<T> {
	const cache = new Map<string, Promise<T>>();

	return (providers) => {
		const key = [...providers].toSorted((first, second) => first.localeCompare(second)).join(',');
		const cached = cache.get(key);

		if (cached) return cached;

		const promise = factory(providers);

		cache.set(key, promise);

		void promise.catch(() => {
			cache.delete(key);
		});

		return promise;
	};
}
