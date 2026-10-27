import type { MessageLevel, OutputEvent, StatusState, SummaryRow } from './events.js';

import { formatCount, formatDuration } from './format.js';

type Paint = (text: string) => string;

export interface Palette {
	blue: Paint;
	gray: Paint;
	green: Paint;
	magenta: Paint;
	red: Paint;
	yellow: Paint;
}

type EndEvent = Extract<OutputEvent, { type: 'end' }>;

type TerminalState = Exclude<StatusState, 'start' | 'stop' | 'update'>;

function unpainted(text: string) {
	return text;
}

export const plainPalette: Palette = {
	blue: unpainted,
	gray: unpainted,
	green: unpainted,
	magenta: unpainted,
	red: unpainted,
	yellow: unpainted,
};

export function getStateSymbol(state: TerminalState, palette: Palette) {
	if (state === 'succeed') return palette.green('✓');
	if (state === 'fail') return palette.red('✗');

	return palette.yellow('⚠');
}

export function formatMessage(level: MessageLevel, text: string, palette: Palette) {
	switch (level) {
		case 'detail': {
			return palette.gray(`  ${text}`);
		}
		case 'error': {
			return `${getStateSymbol('fail', palette)} ${palette.red(text)}`;
		}
		case 'info': {
			return text;
		}
		case 'step': {
			return palette.blue(text);
		}
		case 'success': {
			return `${getStateSymbol('succeed', palette)} ${text}`;
		}
		case 'title': {
			return palette.magenta(`=== ${text} ===`);
		}
		case 'warn': {
			return `${getStateSymbol('warn', palette)} ${palette.yellow(text)}`;
		}
	}
}

export function formatSummaryRows(rows: Array<SummaryRow>, palette: Palette) {
	const width = Math.max(...rows.map(([label]) => label.length)) + 2;

	return rows.map(([label, value]) => {
		const formatted = typeof value === 'number' ? formatCount(value) : value;

		return `  ${palette.gray(`${label}:`.padEnd(width))}${formatted}`;
	});
}

export function formatData(value: unknown) {
	return typeof value === 'string' ? value : JSON.stringify(value, undefined, 2);
}

export function formatEnd(event: EndEvent, palette: Palette) {
	if (event.status === 'ok') {
		return [formatMessage('detail', `Finished in ${formatDuration(event.durationMs)}`, palette)];
	}

	const level = event.status === 'failed' || event.forced ? 'error' : 'warn';
	const lines = event.message === undefined ? [] : [formatMessage(level, event.message, palette)];

	if (event.detail) lines.push(formatMessage('detail', event.detail, palette));

	return lines;
}
