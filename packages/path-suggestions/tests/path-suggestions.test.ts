import { describe, expect, test } from 'vitest';

import type { PathEntry } from '../src/index.js';

import { getPathSimilarity, getPathSuggestions, normalizePath } from '../src/index.js';

const entries: Array<PathEntry> = [
	{ title: 'Sanwan Yuemei Suspension Bridge', url: '/sanwan-yuemei-suspension-bridge/' },
	{ title: 'Sanyi Wood Sculpture Museum', url: '/sanyi-wood-sculpture-museum/' },
	{ title: 'Keelung Ghost Festival', url: '/posts/keelung-ghost-festival/' },
];

describe('normalizePath', () => {
	test('strips trailing slashes', () => {
		expect(normalizePath('/posts/keelung/')).toBe('/posts/keelung');
		expect(normalizePath('/posts/keelung///')).toBe('/posts/keelung');
	});

	test('keeps the root as a single slash', () => {
		expect(normalizePath('/')).toBe('/');
	});
});

describe('getPathSimilarity', () => {
	test('scores identical strings as 1', () => {
		expect(getPathSimilarity('/keelung', '/keelung')).toBe(1);
		expect(getPathSimilarity('', '')).toBe(1);
	});

	test('scores unrelated strings near 0', () => {
		expect(getPathSimilarity('/abcdefgh', '/12345678')).toBeLessThan(0.2);
	});

	test('lifts a truncated string above a same-length unrelated one', () => {
		const truncated = getPathSimilarity('/sanwan-yue', '/sanwan-yuemei-suspension-bridge');
		const unrelated = getPathSimilarity('/sanwan-yue', '/keelung-ghost-festival-parade-xy');

		expect(truncated).toBeGreaterThan(unrelated);
	});

	test('never exceeds 1 once the substring bonus applies', () => {
		expect(getPathSimilarity('/keelung', '/keelung-g')).toBeLessThanOrEqual(1);
	});
});

describe('getPathSuggestions', () => {
	test('redirects when one candidate is far ahead', () => {
		const result = getPathSuggestions({ entries, path: '/sanwan-yuemei-suspension-bridg' });

		expect(result).toEqual({ type: 'redirect', url: '/sanwan-yuemei-suspension-bridge/' });
	});

	test('never redirects to the path already requested', () => {
		const result = getPathSuggestions({ entries, path: '/sanwan-yuemei-suspension-bridge' });

		expect(result?.type).toBe('list');
	});

	test('lists candidates over the threshold, best first', () => {
		const result = getPathSuggestions({ entries, path: '/san', threshold: 0.1 });

		expect(result?.type).toBe('list');

		if (result?.type !== 'list') throw new Error('expected a list');

		expect(result.items.at(0)?.url).toBe('/sanyi-wood-sculpture-museum/');
		expect(result.items.map(({ score }) => score)).toEqual(
			result.items.map(({ score }) => score).toSorted((scoreA, scoreB) => scoreB - scoreA),
		);
	});

	test('caps the list at the limit', () => {
		const result = getPathSuggestions({ entries, limit: 2, path: '/san', threshold: 0 });

		if (result?.type !== 'list') throw new Error('expected a list');

		expect(result.items).toHaveLength(2);
	});

	test('returns undefined when nothing clears the threshold', () => {
		expect(getPathSuggestions({ entries, path: '/completely-unrelated-xyz' })).toBeUndefined();
	});

	test('returns undefined for an empty catalogue', () => {
		expect(getPathSuggestions({ entries: [], path: '/keelung' })).toBeUndefined();
	});

	// The substring bonus saturates at 1, so a truncated path redirects even at the strictest threshold
	test('still redirects a truncated path at a redirect threshold of 1', () => {
		const result = getPathSuggestions({
			entries,
			path: '/sanwan-yuemei-suspension-bridg',
			redirectThreshold: 1,
		});

		expect(result?.type).toBe('redirect');
	});

	test('lists rather than redirects a typo, which earns no substring bonus', () => {
		const result = getPathSuggestions({
			entries,
			path: '/sanyi-wood-sculpture-musuem',
			redirectThreshold: 1,
		});

		expect(result?.type).toBe('list');
	});
});
