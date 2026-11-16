import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import { getTopButtonVisibility } from '../../src/top-button/visibility.js';

const viewportHeight = fc.integer({ max: 2000, min: 300 });
const pageHeight = fc.integer({ max: 50_000, min: 0 });
const offset = fc.integer({ max: 50_000, min: 0 });

const sample = fc.record({
	accumulator: fc.integer({ max: 200, min: -200 }),
	isHidden: fc.boolean(),
	lastScrollY: offset,
	pageHeight,
	scrollY: offset,
	viewportHeight,
});

function getGate(viewport: number, page: number) {
	return Math.max(viewport * 2, page * 0.2);
}

describe('getTopButtonVisibility', () => {
	test.prop([sample])('stays hidden below the gate', (scroll) => {
		fc.pre(scroll.scrollY < getGate(scroll.viewportHeight, scroll.pageHeight));

		expect(getTopButtonVisibility(scroll)).toEqual({ accumulator: 0, isHidden: true });
	});

	const deep = { lastScrollY: 10_000, pageHeight: 20_000, viewportHeight: 800 };

	test('reveals only once the reader has scrolled up more than 64 px', () => {
		expect(
			getTopButtonVisibility({ ...deep, accumulator: 0, isHidden: true, scrollY: 9936 }),
		).toEqual({ accumulator: 64, isHidden: true });
		expect(
			getTopButtonVisibility({ ...deep, accumulator: 0, isHidden: true, scrollY: 9935 }),
		).toEqual({ accumulator: 0, isHidden: false });
	});

	test('hides only once the reader has scrolled down more than 16 px', () => {
		expect(
			getTopButtonVisibility({ ...deep, accumulator: 0, isHidden: false, scrollY: 10_016 }),
		).toEqual({ accumulator: -16, isHidden: false });
		expect(
			getTopButtonVisibility({ ...deep, accumulator: 0, isHidden: false, scrollY: 10_017 }),
		).toEqual({ accumulator: 0, isHidden: true });
	});

	test('carries the distance across scroll samples', () => {
		expect(
			getTopButtonVisibility({ ...deep, accumulator: -10, isHidden: false, scrollY: 10_007 }),
		).toEqual({ accumulator: 0, isHidden: true });
	});
});
