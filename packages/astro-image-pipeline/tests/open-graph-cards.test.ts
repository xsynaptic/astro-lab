import { describe, expect, test } from 'vitest';

import type { OpenGraphCardInput, OpenGraphCardValue } from '../src/open-graph-cards.js';

import { canonicalizeOpenGraphCard, getCardName } from '../src/open-graph-cards.js';

const cardFormat = { format: 'jpg' } as const;

function unsorted(entries: Array<[string, OpenGraphCardValue | undefined]>): OpenGraphCardInput {
	return Object.fromEntries(entries);
}

describe('getCardName', () => {
	test('names a card by its id and format', () => {
		expect(getCardName({ id: 'index-atlas', input: { title: 'Atlas' } }, cardFormat)).toBe(
			'index-atlas.jpg',
		);
	});

	test.each(['a b', '../escape', 'a/./b', 'quote"d'])('refuses %j as an id', (id) => {
		expect(() => getCardName({ id, input: {} }, cardFormat)).toThrow("can't be named");
	});
});

describe('canonicalizeOpenGraphCard', () => {
	test('sorts nested keys and drops undefined at every depth', () => {
		const card = canonicalizeOpenGraphCard({
			input: unsorted([
				[
					'b',
					[
						unsorted([
							['y', 1],
							['x', undefined],
							['w', 2],
						]),
					],
				],
				[
					'a',
					unsorted([
						['d', undefined],
						['c', true],
					]),
				],
			]),
		});

		expect(JSON.stringify(card)).toBe('{"input":{"a":{"c":true},"b":[{"w":2,"y":1}]}}');
	});

	test('keeps a stable canonical form, resolving the image to its path', () => {
		const card = canonicalizeOpenGraphCard({
			image: { id: 'media/photo', path: 'uploads/photo.jpg', treatment: 'blur' },
			input: { title: 'Atlas' },
		});

		expect(JSON.stringify(card)).toBe(
			'{"image":{"path":"uploads/photo.jpg","treatment":"blur"},"input":{"title":"Atlas"}}',
		);
	});

	test('locates an image by its id when it has no path', () => {
		expect(canonicalizeOpenGraphCard({ image: { id: 'photo.jpg' }, input: {} })).toStrictEqual({
			image: { path: 'photo.jpg' },
			input: {},
		});
	});

	test.each([NaN, Infinity])('refuses %s, which JSON would turn into null', (value) => {
		expect(() => canonicalizeOpenGraphCard({ input: { value } })).toThrow(
			'JSON has no such number',
		);
	});
});
