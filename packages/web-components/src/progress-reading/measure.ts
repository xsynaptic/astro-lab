export interface ReadingFrame {
	coveredBand: number;
	frameHeight: number;
	frameTop: number;
	viewportHeight: number;
}

export function getReadingProgress({
	coveredBand,
	frameHeight,
	frameTop,
	viewportHeight,
}: ReadingFrame) {
	const scrollable = Math.max(1, frameHeight - (viewportHeight - coveredBand));

	return Math.min(Math.max(0, (coveredBand - frameTop) / scrollable), 1);
}
