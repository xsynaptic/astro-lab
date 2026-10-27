import { stripVTControlCharacters } from 'node:util';

import type { Reporter, ReporterStreams } from './events.js';

import { formatProgressText } from './format.js';
import {
	formatData,
	formatEnd,
	formatMessage,
	formatSummaryRows,
	getStateSymbol,
	plainPalette,
} from './human-format.js';

interface OpenStatus {
	lastPrint: number;
	text: string;
}

const progressIntervalMs = 10_000;

export function createPlainReporter(
	{ stderr, stdout }: ReporterStreams,
	now: () => number = Date.now,
): Reporter {
	const statuses = new Map<number, OpenStatus>();
	let activeId: number | undefined;

	function writeLine(line: string) {
		stderr.write(`${stripVTControlCharacters(line)}\n`);
	}

	function closeStatus(id: number) {
		statuses.delete(id);

		if (activeId === id) activeId = undefined;
	}

	return {
		emit(event) {
			switch (event.type) {
				case 'data': {
					stdout.write(`${formatData(event.value)}\n`);
					break;
				}
				case 'end': {
					const active = activeId === undefined ? undefined : statuses.get(activeId);

					if (active && activeId !== undefined && event.status !== 'ok') {
						writeLine(`${getStateSymbol('fail', plainPalette)} ${active.text}`);
						closeStatus(activeId);
					}

					for (const line of formatEnd(event, plainPalette)) writeLine(line);
					break;
				}
				case 'message': {
					writeLine(formatMessage(event.level, event.text, plainPalette));
					break;
				}
				case 'progress': {
					const status = statuses.get(event.id);
					const time = now();

					if (!status || time - status.lastPrint < progressIntervalMs) break;

					status.lastPrint = time;
					writeLine(formatProgressText(event));
					break;
				}
				case 'start': {
					writeLine(formatMessage('title', event.title, plainPalette));
					break;
				}
				case 'status': {
					const { id, state, text } = event;

					if (state === 'start') {
						statuses.set(id, { lastPrint: now(), text });
						activeId = id;
						writeLine(text);
						break;
					}

					const status = statuses.get(id);

					if (!status) break;

					if (state === 'update') {
						status.text = text;
						break;
					}

					if (state !== 'stop') writeLine(`${getStateSymbol(state, plainPalette)} ${text}`);

					closeStatus(id);
					break;
				}
				case 'summary': {
					for (const line of formatSummaryRows(event.rows, plainPalette)) writeLine(line);
					break;
				}
			}
		},
	};
}
