import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import type { PathEntry } from '../src/index.js';

import {
	getPathSimilarity,
	getPathSuggestions,
	normalizePath,
	pathSuggestionDefaults,
} from '../src/index.js';

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

	test('lifts a truncated string above a same-length unrelated one', () => {
		const truncated = getPathSimilarity('/sanwan-yue', '/sanwan-yuemei-suspension-bridge');
		const unrelated = getPathSimilarity('/sanwan-yue', '/keelung-ghost-festival-parade-xy');

		expect(truncated).toBeGreaterThan(unrelated);
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

	test('still redirects when the winner is listed twice, with and without its slash', () => {
		const result = getPathSuggestions({
			entries: [
				{ title: 'Bridge', url: '/sanwan-yuemei-suspension-bridge/' },
				{ title: 'Bridge', url: '/sanwan-yuemei-suspension-bridge' },
			],
			path: '/sanwan-yuemei-suspension-bridg',
		});

		expect(result).toEqual({ type: 'redirect', url: '/sanwan-yuemei-suspension-bridge/' });
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

const pathText = fc.string({ maxLength: 8, unit: fc.constantFrom('a', 'b', 'c', '-', '/') });

const requestPath = pathText.map((path) => `/${path}`);

const pathEntries = fc.array(
	pathText.map((path) => ({ title: path, url: `/${path}` })),
	{ maxLength: 6 },
);

describe('properties', () => {
	test.prop([pathText, pathText])(
		'scores within 0 to 1, the same in either direction',
		(first, second) => {
			const score = getPathSimilarity(first, second);

			expect(score).toBeGreaterThanOrEqual(0);
			expect(score).toBeLessThanOrEqual(1);
			expect(getPathSimilarity(second, first)).toBe(score);
			expect(getPathSimilarity(first, first)).toBe(1);
		},
	);

	test.prop([requestPath, pathEntries])(
		'never redirects a visitor to the path they asked for',
		(path, candidates) => {
			const result = getPathSuggestions({ entries: candidates, path });

			if (result?.type === 'redirect')
				expect(normalizePath(result.url)).not.toBe(normalizePath(path));
		},
	);

	test.prop([requestPath, pathEntries])(
		'lists only candidates over the threshold, best first, up to the limit',
		(path, candidates) => {
			const result = getPathSuggestions({ entries: candidates, path });
			const scores = candidates.map((entry) =>
				getPathSimilarity(normalizePath(path), normalizePath(entry.url)),
			);
			const isAnyOverThreshold = scores.some((score) => score >= pathSuggestionDefaults.threshold);

			expect(result !== undefined).toBe(isAnyOverThreshold);

			if (result?.type !== 'list') return;

			expect(result.items.length).toBeLessThanOrEqual(pathSuggestionDefaults.limit);
			for (const [index, item] of result.items.entries()) {
				expect(item.score).toBeGreaterThanOrEqual(pathSuggestionDefaults.threshold);
				expect(item.score).toBeLessThanOrEqual(result.items[index - 1]?.score ?? 1);
			}
		},
	);

	test.prop([requestPath, pathEntries])(
		'redirects only to a candidate that beats every other',
		(path, candidates) => {
			const result = getPathSuggestions({ entries: candidates, path });

			fc.pre(result?.type === 'redirect');

			const target = getPathSimilarity(normalizePath(path), normalizePath(result.url));
			const rivals = candidates.filter(
				(entry) => normalizePath(entry.url) !== normalizePath(result.url),
			);

			for (const rival of rivals) {
				expect(getPathSimilarity(normalizePath(path), normalizePath(rival.url))).toBeLessThan(
					target,
				);
			}
		},
	);
});
