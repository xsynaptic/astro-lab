import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import { getNextTrickle } from '../../src/progress-loading/trickle.js';

const random = fc.double({ max: 1, maxExcluded: true, min: 0, noNaN: true });

describe('getNextTrickle', () => {
	test.prop([fc.double({ max: 1, maxExcluded: true, min: 0, noNaN: true }), random])(
		'never decreases and never reaches 1',
		(progress, step) => {
			const next = getNextTrickle(progress, step);

			expect(next).toBeGreaterThanOrEqual(progress);
			expect(next).toBeLessThan(1);
		},
	);

	test.prop([fc.integer({ max: 90, min: 0 }), fc.integer({ max: 90, min: 0 }), random])(
		'takes smaller steps as it climbs',
		(first, second, step) => {
			fc.pre(first < second && step > 0.01);

			const lower = first / 100;
			const higher = second / 100;

			expect(getNextTrickle(higher, step) - higher).toBeLessThan(
				getNextTrickle(lower, step) - lower,
			);
		},
	);

	test('levels off well below 1 on a navigation that never ends', () => {
		let progress = 0.2;

		for (let step = 0; step < 10_000; step += 1) progress = getNextTrickle(progress, 0.999);

		expect(progress).toBeLessThan(0.99);
	});
});
