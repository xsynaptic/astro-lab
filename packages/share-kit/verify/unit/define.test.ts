import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { shareKitCountLength } from '../../src/count.js';
import { defineShareKit } from '../../src/define.js';
import {
	defineShareKitDestination,
	shareKitBluesky,
	shareKitThreads,
	shareKitX,
} from '../../src/destinations.js';
import { shareKitLandscapeFormat } from '../../src/formats.js';

const registry = { define: vi.fn(), get: vi.fn() };

beforeEach(() => {
	vi.stubGlobal('customElements', registry);
	vi.spyOn(console, 'error').mockReturnValue();
	vi.spyOn(console, 'warn').mockReturnValue();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	registry.define.mockReset();
	registry.get.mockReset();
});

function expectRefused(define: () => void) {
	expect(define).not.toThrow();
	expect(registry.define).not.toHaveBeenCalled();
	expect(console.error).toHaveBeenCalledOnce();
}

describe('defineShareKit', () => {
	test('defines the element for a valid catalogue', () => {
		defineShareKit({ destinations: [shareKitBluesky, shareKitX] });

		expect(registry.define).toHaveBeenCalledOnce();
		expect(registry.define.mock.calls[0]?.[0]).toBe('share-kit');
	});

	test('refuses an empty catalogue without throwing', () => {
		// @ts-expect-error the catalogue is a non-empty tuple
		expectRefused(() => defineShareKit({ destinations: [] }));
	});

	test('refuses a repeated id without throwing', () => {
		expectRefused(() =>
			defineShareKit({ destinations: [shareKitX, { ...shareKitX, limit: 300 }] }),
		);
	});

	test('refuses an id that collides with an interface icon without throwing', () => {
		const qr = defineShareKitDestination({
			actions: { desktop: [], mobile: [] },
			count: shareKitCountLength,
			id: 'qr',
			images: [shareKitLandscapeFormat],
			label: 'QR',
			shape: 'url',
		});

		expectRefused(() => defineShareKit({ destinations: [shareKitThreads, qr] }));
	});

	test('warns about open-composer with no composer, and still defines', () => {
		const { composer: _dropped, ...spread } = shareKitX;

		defineShareKit({ destinations: [spread] });

		expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"x" lists open-composer'));
		expect(registry.define).toHaveBeenCalledOnce();
	});

	test('ignores a second call with a warning', () => {
		registry.get.mockReturnValue(Object);
		defineShareKit({ destinations: [shareKitX] });

		expect(registry.define).not.toHaveBeenCalled();
		expect(console.warn).toHaveBeenCalledOnce();
	});
});
