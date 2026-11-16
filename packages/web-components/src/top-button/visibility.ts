const hideThresholdPixels = 16;
const revealThresholdPixels = 64;

const minViewportMultiple = 2;
const minPageFraction = 0.2;

export interface TopButtonScrollSample {
	accumulator: number;
	isHidden: boolean;
	lastScrollY: number;
	pageHeight: number;
	scrollY: number;
	viewportHeight: number;
}

export interface TopButtonVisibility {
	accumulator: number;
	isHidden: boolean;
}

export function getTopButtonVisibility(sample: TopButtonScrollSample): TopButtonVisibility {
	const minScroll = Math.max(
		sample.viewportHeight * minViewportMultiple,
		sample.pageHeight * minPageFraction,
	);

	if (sample.scrollY < minScroll) return { accumulator: 0, isHidden: true };

	const accumulator = sample.accumulator - (sample.scrollY - sample.lastScrollY);

	if (accumulator < -hideThresholdPixels) return { accumulator: 0, isHidden: true };

	if (accumulator > revealThresholdPixels) return { accumulator: 0, isHidden: false };

	return { accumulator, isHidden: sample.isHidden };
}
