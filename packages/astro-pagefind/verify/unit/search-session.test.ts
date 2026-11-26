import { describe, expect, test } from 'vitest';

import type { SearchToggleSearchEndDetail } from '../../src/search-session.js';

import {
	createSearchSession,
	getResultCount,
	normalizeSearchQuery,
} from '../../src/search-session.js';

function startSession() {
	const reported: Array<SearchToggleSearchEndDetail> = [];
	const session = createSearchSession((outcome) => {
		reported.push(outcome);
	});

	return { reported, session };
}

describe('createSearchSession', () => {
	test('reports only the outcome standing when the search ends', () => {
		const { reported, session } = startSession();

		session.update('t', 40);
		session.update('temple', 3);
		session.update(' temple gate ', 1);
		session.end(true);

		expect(reported).toEqual([{ clicked: true, query: 'temple gate', results: 1 }]);
	});

	test('reports once however many times the search ends', () => {
		const { reported, session } = startSession();

		session.update('fog', 0);
		session.end(true);
		session.end(false);
		session.end(false);

		expect(reported).toEqual([{ clicked: true, query: 'fog', results: 0 }]);
	});

	test.each([
		['an empty term', '  ', 2],
		['an unknown count', 'lantern', undefined],
	])('%s clears the pending outcome', (_case, searchTerm, results) => {
		const { reported, session } = startSession();

		session.update('lantern', 2);
		session.update(searchTerm, results);
		session.end(false);

		expect(reported).toEqual([]);
	});
});

describe('getResultCount', () => {
	test('drops a match only on image fields but keeps one on another meta field', () => {
		const count = getResultCount({
			results: [
				{ matchedMetaFields: ['image'], words: [] },
				{ matchedMetaFields: ['image', 'image_2x'], words: [] },
				{ matchedMetaFields: ['image', 'title'], words: [] },
				{ words: [4, 9] },
			],
		});

		expect(count).toBe(2);
	});

	test.each([undefined, { results: 'none' }])('is unknown for %j', (result) => {
		expect(getResultCount(result)).toBeUndefined();
	});
});

describe('normalizeSearchQuery', () => {
	test('collapses whitespace', () => {
		expect(normalizeSearchQuery('old \n  temple')).toBe('old temple');
	});

	test('caps the query length', () => {
		expect(normalizeSearchQuery('x'.repeat(200))).toBe('x'.repeat(100));
	});

	test('drops a query too short to mean anything', () => {
		expect(normalizeSearchQuery('t')).toBeUndefined();
	});
});
