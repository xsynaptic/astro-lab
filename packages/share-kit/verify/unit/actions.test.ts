import { afterEach, describe, expect, test, vi } from 'vitest';

import { getShareCapabilities, openComposer } from '../../src/actions.js';
import { ShareIconSource } from '../../src/icons.js';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test('an unknown data-can token is dropped with a warning', () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();

	expect(getShareCapabilities('files handheld link')).toEqual(['files', 'link']);
	expect(warn).toHaveBeenCalledWith(expect.stringContaining('handheld'));
});

describe('openComposer', () => {
	test('opens an http(s) composer in a new tab, and hands any other scheme to its app', () => {
		const location = { assign: vi.fn(), href: 'https://example.com/' };
		const open = vi.fn();

		vi.stubGlobal('location', location);
		vi.stubGlobal('window', { open });
		openComposer('https://x.com/intent/tweet?text=a');
		openComposer('mailto:?subject=a');

		expect(open).toHaveBeenCalledExactlyOnceWith(
			'https://x.com/intent/tweet?text=a',
			'_blank',
			'noopener',
		);
		expect(location.assign).toHaveBeenCalledExactlyOnceWith('mailto:?subject=a');
	});
});

test('a rejected icons loader keeps the text fallbacks and warns', async () => {
	const warn = vi.spyOn(console, 'warn').mockReturnValue();
	const source = new ShareIconSource(() => Promise.reject(new Error('offline')));

	expect(source.isLoading).toBe(true);
	expect(await source.load()).toEqual({});
	expect(source.isLoading).toBe(false);
	expect(warn).toHaveBeenCalledOnce();
});
