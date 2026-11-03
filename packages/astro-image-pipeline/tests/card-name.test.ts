import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import type { CardInput, CardValue } from '../src/card-name.js';

import { canonicalizeCard, getCardName } from '../src/card-name.js';

const cardFormat = { format: 'jpg' } as const;

const cardKeys = ['a', 'b', 'B', '9', '10', '__proto__', 'constructor'];

const { cardValue } = fc.letrec<{ cardValue: CardValue }>((tie) => ({
	cardValue: fc.oneof(
		{ depthSize: 'small' },
		fc.boolean(),
		fc.integer({ max: 3, min: -3 }),
		fc.constantFrom('', 'x', 'é'),
		fc.array(tie('cardValue'), { maxLength: 3 }),
		fc.dictionary(fc.constantFrom(...cardKeys), fc.option(tie('cardValue'), { nil: undefined }), {
			maxKeys: 4,
			noNullPrototype: true,
		}),
	),
}));

const cardInput = fc.dictionary(fc.constantFrom(...cardKeys), cardValue, {
	maxKeys: 4,
	noNullPrototype: true,
});

function reverseKeys(value: CardValue): CardValue {
	if (Array.isArray(value)) return value.map((item) => reverseKeys(item));

	if (typeof value !== 'object') return value;

	return Object.fromEntries(
		Object.entries(value)
			.toReversed()
			.map(([key, entry]) => [key, entry === undefined ? entry : reverseKeys(entry)]),
	);
}

function unsorted(entries: Array<[string, CardValue | undefined]>): CardInput {
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

describe('canonicalizeCard', () => {
	test('sorts nested keys and drops undefined at every depth', () => {
		const card = canonicalizeCard({
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
		const card = canonicalizeCard({
			image: { id: 'media/photo', path: 'uploads/photo.jpg', treatment: 'blur' },
			input: { title: 'Atlas' },
		});

		expect(JSON.stringify(card)).toBe(
			'{"image":{"path":"uploads/photo.jpg","treatment":"blur"},"input":{"title":"Atlas"}}',
		);
	});

	test('locates an image by its id when it has no path', () => {
		expect(canonicalizeCard({ image: { id: 'photo.jpg' }, input: {} })).toStrictEqual({
			image: { path: 'photo.jpg' },
			input: {},
		});
	});

	test.each([NaN, Infinity])('refuses %s, which JSON would turn into null', (value) => {
		expect(() => canonicalizeCard({ input: { value } })).toThrow('JSON has no such number');
	});

	test.prop([cardInput])(
		'gives the same canonical form whatever order the keys arrive in',
		(input) => {
			const reordered = reverseKeys(input) as CardInput;

			expect(JSON.stringify(canonicalizeCard({ input: reordered }))).toBe(
				JSON.stringify(canonicalizeCard({ input })),
			);
		},
	);

	test.prop([cardInput])('keeps every defined value of the input', (input) => {
		const recorded = JSON.stringify(canonicalizeCard({ input }).input);

		expect(JSON.parse(recorded)).toEqual(input);
	});
});
