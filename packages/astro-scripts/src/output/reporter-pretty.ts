import type { Ora } from 'ora';

import chalk from 'chalk';
import ora from 'ora';

import type { OutputEvent, Reporter, ReporterStreams, StatusState } from './events.js';

import { formatProgressText } from './format.js';
import {
	formatData,
	formatEnd,
	formatMessage,
	formatSummaryRows,
	getStateSymbol,
} from './human-format.js';

type StatusEvent = Extract<OutputEvent, { type: 'status' }>;

function isTerminal(stream: NodeJS.WritableStream) {
	return 'isTTY' in stream && stream.isTTY === true;
}

export function createPrettyReporter({ stderr, stdout }: ReporterStreams): Reporter {
	const spinners = new Map<number, Ora>();
	const openIds: Array<number> = [];

	function getActiveSpinner() {
		const activeId = openIds.at(-1);

		return activeId === undefined ? undefined : spinners.get(activeId);
	}

	function writeAround(stream: NodeJS.WritableStream, line: string) {
		const active = getActiveSpinner();

		if (!active?.isSpinning) {
			stream.write(`${line}\n`);
			return;
		}

		active.clear();
		stream.write(`${line}\n`);
		active.render();
	}

	function writeLine(line: string) {
		writeAround(stderr, line);
	}

	function endSpinner(id: number, state: Exclude<StatusState, 'start' | 'update'>, text: string) {
		const spinner = spinners.get(id);

		if (!spinner) return;

		const wasActive = openIds.at(-1) === id;

		if (state === 'stop') {
			spinner.stop();
		} else {
			spinner.stopAndPersist({ symbol: getStateSymbol(state, chalk), text });
		}

		spinners.delete(id);
		openIds.splice(openIds.indexOf(id), 1);

		const outer = getActiveSpinner();

		if (wasActive && outer?.isEnabled) outer.start();
	}

	function onStatus({ id, state, text }: StatusEvent) {
		if (state === 'start') {
			getActiveSpinner()?.stop();
			// Stdin stays cooked so the terminal still signals the whole process group on Ctrl-C, child processes included
			spinners.set(id, ora({ discardStdin: false, stream: stderr, text }).start());
			openIds.push(id);
			return;
		}

		if (state === 'update') {
			const spinner = spinners.get(id);

			if (spinner) spinner.text = text;
			return;
		}

		endSpinner(id, state, text);
	}

	return {
		emit(event) {
			switch (event.type) {
				case 'data': {
					const line = event.render?.() ?? formatData(event.value);

					if (isTerminal(stdout)) {
						writeAround(stdout, line);
					} else {
						stdout.write(`${line}\n`);
					}
					break;
				}
				case 'end': {
					const activeId = openIds.at(-1);
					const active = getActiveSpinner();

					if (active && activeId !== undefined && event.status !== 'ok') {
						spinners.delete(activeId);
						active.stopAndPersist({ symbol: getStateSymbol('fail', chalk), text: active.text });
					}

					// An open spinner's render interval keeps the process alive
					for (const spinner of spinners.values()) spinner.stop();

					spinners.clear();
					openIds.length = 0;

					for (const line of formatEnd(event, chalk)) writeLine(line);
					break;
				}
				case 'message': {
					writeLine(formatMessage(event.level, event.text, chalk));
					break;
				}
				case 'progress': {
					const spinner = spinners.get(event.id);

					if (spinner) spinner.text = formatProgressText(event);
					break;
				}
				case 'start': {
					writeLine(formatMessage('title', event.title, chalk));
					break;
				}
				case 'status': {
					onStatus(event);
					break;
				}
				case 'summary': {
					for (const line of formatSummaryRows(event.rows, chalk)) writeLine(line);
					break;
				}
			}
		},
	};
}
