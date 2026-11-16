import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import { getReadingProgress } from '../../src/progress-reading/measure.js';

const length = fc.double({ max: 10_000, min: 0, noNaN: true });

describe('getReadingProgress', () => {
	const frame = fc.record({
		coveredBand: fc.double({ max: 400, min: 0, noNaN: true }),
		frameHeight: length,
		frameTop: fc.double({ max: 10_000, min: -10_000, noNaN: true }),
		viewportHeight: fc.double({ max: 2000, min: 400, noNaN: true }),
	});

	test.prop([frame])('stays within 0 to 1', (sample) => {
		const progress = getReadingProgress(sample);

		expect(progress).toBeGreaterThanOrEqual(0);
		expect(progress).toBeLessThanOrEqual(1);
	});

	test.prop([frame, length])('grows as the reader scrolls down', (sample, scrolled) => {
		const before = getReadingProgress(sample);
		const after = getReadingProgress({ ...sample, frameTop: sample.frameTop - scrolled });

		expect(after).toBeGreaterThanOrEqual(before);
	});

	const tallFrame = fc
		.record({
			coveredBand: fc.integer({ max: 400, min: 0 }),
			frameHeight: fc.integer({ max: 10_000, min: 0 }),
			viewportHeight: fc.integer({ max: 2000, min: 400 }),
		})
		.filter((sample) => sample.frameHeight > sample.viewportHeight - sample.coveredBand + 2);

	test.prop([tallFrame])('starts once the frame passes under the covered band', (sample) => {
		expect(getReadingProgress({ ...sample, frameTop: sample.coveredBand })).toBe(0);
		expect(getReadingProgress({ ...sample, frameTop: sample.coveredBand - 1 })).toBeGreaterThan(0);
	});

	test.prop([tallFrame])(
		"ends exactly when the frame's bottom meets the viewport's bottom",
		(sample) => {
			const frameTop = sample.viewportHeight - sample.frameHeight;

			expect(getReadingProgress({ ...sample, frameTop })).toBe(1);
			expect(getReadingProgress({ ...sample, frameTop: frameTop + 1 })).toBeLessThan(1);
		},
	);

	test('reduces to the uncovered viewport when nothing covers the top', () => {
		const progress = getReadingProgress({
			coveredBand: 0,
			frameHeight: 3000,
			frameTop: -1000,
			viewportHeight: 1000,
		});

		expect(progress).toBe(0.5);
	});
});
