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

export function createPrettyReporter({ stderr, stdout }: ReporterStreams): Reporter {
	const spinners = new Map<number, Ora>();
	let activeId: number | undefined;

	function getActiveSpinner() {
		return activeId === undefined ? undefined : spinners.get(activeId);
	}

	function writeLine(line: string) {
		const active = getActiveSpinner();

		if (!active?.isSpinning) {
			stderr.write(`${line}\n`);
			return;
		}

		active.clear();
		stderr.write(`${line}\n`);
		active.render();
	}

	function endSpinner(id: number, state: Exclude<StatusState, 'start' | 'update'>, text: string) {
		const spinner = spinners.get(id);

		if (!spinner) return;

		if (state === 'stop') {
			spinner.stop();
		} else {
			spinner.stopAndPersist({ symbol: getStateSymbol(state, chalk), text });
		}

		spinners.delete(id);

		if (activeId === id) activeId = undefined;
	}

	function onStatus({ id, state, text }: StatusEvent) {
		if (state === 'start') {
			getActiveSpinner()?.stop();
			// Stdin stays cooked so the terminal still signals the whole process group on Ctrl-C, child processes included
			spinners.set(id, ora({ discardStdin: false, stream: stderr, text }).start());
			activeId = id;
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
					stdout.write(`${formatData(event.value)}\n`);
					break;
				}
				case 'end': {
					const active = getActiveSpinner();

					if (active && activeId !== undefined && event.status !== 'ok') {
						endSpinner(activeId, 'fail', active.text);
					}

					// An open spinner's render interval keeps the process alive
					for (const spinner of spinners.values()) spinner.stop();

					spinners.clear();
					activeId = undefined;

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
