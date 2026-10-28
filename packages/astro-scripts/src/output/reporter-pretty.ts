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
	const childTexts = new Map<number, string>();
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

	function closeStatus(id: number) {
		const wasActive = openIds.at(-1) === id;

		openIds.splice(openIds.indexOf(id), 1);

		const outer = getActiveSpinner();

		if (wasActive && outer?.isEnabled) outer.start();
	}

	function endChild(id: number, state: Exclude<StatusState, 'start' | 'update'>, text: string) {
		childTexts.delete(id);

		if (state !== 'stop') writeLine(`${getStateSymbol(state, chalk)} ${text}`);

		closeStatus(id);
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
		closeStatus(id);
	}

	function onStatus({ argv, id, state, text }: StatusEvent) {
		if (state === 'start' && argv) {
			getActiveSpinner()?.stop();
			childTexts.set(id, text);
			openIds.push(id);
			writeLine(formatMessage('step', text, chalk));
			return;
		}

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

		if (childTexts.has(id)) {
			endChild(id, state, text);
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
					const activeChild = activeId === undefined ? undefined : childTexts.get(activeId);

					if (active && activeId !== undefined && event.status !== 'ok') {
						spinners.delete(activeId);
						active.stopAndPersist({ symbol: getStateSymbol('fail', chalk), text: active.text });
					}

					if (activeChild !== undefined && event.status !== 'ok') {
						writeLine(`${getStateSymbol('fail', chalk)} ${activeChild}`);
					}

					// An open spinner's render interval keeps the process alive
					for (const spinner of spinners.values()) spinner.stop();

					spinners.clear();
					childTexts.clear();
					openIds.length = 0;

					for (const line of formatEnd(event, chalk)) writeLine(line);
					break;
				}
				case 'message': {
					writeLine(formatMessage(event.level, event.text, chalk));
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
