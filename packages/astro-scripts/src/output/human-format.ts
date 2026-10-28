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

type StatusEvent = Extract<OutputEvent, { type: 'status' }>;

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
	if (state === 'skip') return palette.gray('–');

	return palette.yellow('⚠');
}

function formatStatusText({ durationMs, text }: StatusEvent) {
	if (durationMs === undefined) return text;

	return `${text} · ${formatDuration(durationMs)}`;
}

export function isClosingStatus(
	event: StatusEvent,
): event is StatusEvent & { state: TerminalState } {
	return event.state !== 'start' && event.state !== 'stop' && event.state !== 'update';
}

export function formatStatusClose(event: StatusEvent & { state: TerminalState }, palette: Palette) {
	const line = `${getStateSymbol(event.state, palette)} ${formatStatusText(event)}`;

	if (event.detail === undefined) return [line];

	return [line, formatMessage('detail', event.detail, palette)];
}

function formatStepOutcomes({ skipped = [], warned = [] }: EndEvent, palette: Palette) {
	const lines: Array<string> = [];

	if (warned.length > 0) lines.push(formatMessage('warn', `Warned: ${warned.join(', ')}`, palette));

	if (skipped.length > 0) {
		lines.push(`${getStateSymbol('skip', palette)} Skipped: ${skipped.join(', ')}`);
	}

	return lines;
}

export function formatMessage(level: MessageLevel, text: string, palette: Palette) {
	switch (level) {
		case 'detail': {
			return palette.gray(
				text
					.split('\n')
					.map((line) => `  ${line}`)
					.join('\n'),
			);
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
	const lines = formatStepOutcomes(event, palette);

	if (event.status === 'ok') {
		lines.push(formatMessage('detail', `Finished in ${formatDuration(event.durationMs)}`, palette));

		return lines;
	}

	const level = event.status === 'failed' || event.forced ? 'error' : 'warn';

	if (event.message !== undefined) lines.push(formatMessage(level, event.message, palette));

	if (event.detail) lines.push(formatMessage('detail', event.detail, palette));

	return lines;
}
