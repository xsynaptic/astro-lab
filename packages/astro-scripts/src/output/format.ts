const countFormat = new Intl.NumberFormat('en-CA');

const byteUnits = ['B', 'kB', 'MB', 'GB', 'TB'] as const;

export function formatCount(count: number) {
	return countFormat.format(count);
}

export function formatBytes(bytes: number) {
	let value = bytes;
	let unitIndex = 0;

	while (value >= 1000 && unitIndex < byteUnits.length - 1) {
		value /= 1000;
		unitIndex += 1;
	}

	const unit = byteUnits[unitIndex] ?? 'B';

	return unitIndex === 0 ? `${String(value)} ${unit}` : `${value.toFixed(1)} ${unit}`;
}

export function formatError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

export function formatDuration(milliseconds: number) {
	const seconds = milliseconds / 1000;

	if (seconds < 60) return `${seconds.toFixed(1)}s`;

	const totalSeconds = Math.round(seconds);
	const minutes = Math.floor(totalSeconds / 60);
	const remainder = totalSeconds % 60;

	return `${String(minutes)}m ${String(remainder).padStart(2, '0')}s`;
}

function formatRate(perSecond: number) {
	return perSecond >= 10 ? formatCount(Math.round(perSecond)) : perSecond.toFixed(1);
}

export interface ProgressSnapshot {
	done: number;
	label: string;
	note?: string;
	perSecond?: number;
	total: number;
}

export function formatProgressText({ done, label, note, perSecond, total }: ProgressSnapshot) {
	const percent = total === 0 ? 100 : Math.floor((done / total) * 100);
	const parts = [`${label} ${formatCount(done)} / ${formatCount(total)} (${String(percent)}%)`];
	const remaining = total - done;

	if (perSecond !== undefined && perSecond > 0) {
		parts.push(`${formatRate(perSecond)}/s`);

		if (remaining > 0) parts.push(`~${formatDuration((remaining / perSecond) * 1000)} left`);
	}

	if (note) parts.push(note);

	return parts.join(' · ');
}
