import { stripVTControlCharacters } from 'node:util';

import type { OutputEvent, Reporter, ReporterStreams } from './events.js';

import { formatProgressText } from './format.js';
import {
	formatData,
	formatEnd,
	formatMessage,
	formatStatusClose,
	formatSummaryRows,
	getStateSymbol,
	isClosingStatus,
	plainPalette,
} from './human-format.js';

interface PlainReporterOptions {
	isNested?: boolean;
	now?: () => number;
}

interface OpenStatus {
	lastPrint: number;
	lastTenth: number;
	text: string;
}

const progressIntervalMs = 10_000;

function getTenth(done: number, total: number) {
	return total > 0 ? Math.floor((done / total) * 10) : 0;
}

export function createPlainReporter(
	{ stderr, stdout }: ReporterStreams,
	{ isNested = false, now = Date.now }: PlainReporterOptions = {},
): Reporter {
	type StatusEvent = Extract<OutputEvent, { type: 'status' }>;

	const statuses = new Map<number, OpenStatus>();
	const openIds: Array<number> = [];

	function writeLine(line: string) {
		stderr.write(`${stripVTControlCharacters(line)}\n`);
	}

	function closeStatus(id: number) {
		statuses.delete(id);
		openIds.splice(openIds.indexOf(id), 1);
	}

	function onStatus(event: StatusEvent) {
		const { id, state, text } = event;

		if (state === 'start') {
			statuses.set(id, { lastPrint: now(), lastTenth: 0, text });
			openIds.push(id);
			writeLine(text);
			return;
		}

		const status = statuses.get(id);

		if (!status) return;

		if (state === 'update') {
			status.text = text;
			return;
		}

		if (isClosingStatus(event)) {
			for (const line of formatStatusClose(event, plainPalette)) writeLine(line);
		}

		closeStatus(id);
	}

	return {
		emit(event) {
			switch (event.type) {
				case 'data': {
					const line =
						event.render === undefined
							? formatData(event.value)
							: stripVTControlCharacters(event.render());

					stdout.write(`${line}\n`);
					break;
				}
				case 'end': {
					const activeId = openIds.at(-1);
					const active = activeId === undefined ? undefined : statuses.get(activeId);

					if (active && event.status !== 'ok') {
						writeLine(`${getStateSymbol('fail', plainPalette)} ${active.text}`);
					}

					statuses.clear();
					openIds.length = 0;

					if (isNested && event.status === 'ok') break;

					for (const line of formatEnd(event, plainPalette)) writeLine(line);
					break;
				}
				case 'message': {
					writeLine(formatMessage(event.level, event.text, plainPalette));
					break;
				}
				case 'nested': {
					writeLine(event.line);
					break;
				}
				case 'output': {
					writeLine(event.text);
					break;
				}
				case 'progress': {
					const status = statuses.get(event.id);

					if (!status) break;

					const time = now();
					const tenth = getTenth(event.done, event.total);

					if (time - status.lastPrint < progressIntervalMs && tenth <= status.lastTenth) break;

					status.lastPrint = time;
					status.lastTenth = tenth;
					writeLine(formatProgressText(event));
					break;
				}
				case 'start': {
					if (isNested) break;

					writeLine(formatMessage('title', event.title, plainPalette));
					break;
				}
				case 'status': {
					onStatus(event);
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
