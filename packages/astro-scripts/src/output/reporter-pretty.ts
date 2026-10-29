import type { Ora } from 'ora';

import chalk from 'chalk';
import ora from 'ora';

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
} from './human-format.js';

interface PrettyReporterOptions {
	isNested?: boolean;
}

function isTerminal(stream: NodeJS.WritableStream) {
	return 'isTTY' in stream && stream.isTTY === true;
}

export function createPrettyReporter(
	{ stderr, stdout }: ReporterStreams,
	{ isNested = false }: PrettyReporterOptions = {},
): Reporter {
	type EndEvent = Extract<OutputEvent, { type: 'end' }>;
	type StatusEvent = Extract<OutputEvent, { type: 'status' }>;

	const spinners = new Map<number, Ora>();
	const stepTexts = new Map<number, string>();
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

	function endStatus(event: StatusEvent) {
		if (!spinners.has(event.id) && !stepTexts.has(event.id)) return;

		spinners.get(event.id)?.stop();
		spinners.delete(event.id);
		stepTexts.delete(event.id);

		if (isClosingStatus(event)) {
			for (const line of formatStatusClose(event, chalk)) writeLine(line);
		}

		closeStatus(event.id);
	}

	function onStatus(event: StatusEvent) {
		const { id, state, step, text } = event;

		if (state === 'start' && step) {
			getActiveSpinner()?.stop();
			stepTexts.set(id, text);
			openIds.push(id);
			writeLine(formatMessage('step', text, chalk));
			return;
		}

		if (state === 'start') {
			getActiveSpinner()?.stop();
			// Stdin stays cooked so the terminal still signals the whole process group on Ctrl-C, subprocesses included
			spinners.set(id, ora({ discardStdin: false, stream: stderr, text }).start());
			openIds.push(id);
			return;
		}

		if (state === 'update') {
			const spinner = spinners.get(id);

			if (spinner) spinner.text = text;
			return;
		}

		endStatus(event);
	}

	function onEnd(event: EndEvent) {
		const activeId = openIds.at(-1);
		const active = getActiveSpinner();
		const activeStep = activeId === undefined ? undefined : stepTexts.get(activeId);

		if (active && activeId !== undefined && event.status !== 'ok') {
			spinners.delete(activeId);
			active.stopAndPersist({ symbol: getStateSymbol('fail', chalk), text: active.text });
		}

		if (activeStep !== undefined && event.status !== 'ok') {
			writeLine(`${getStateSymbol('fail', chalk)} ${activeStep}`);
		}

		// An open spinner's render interval keeps the process alive
		for (const spinner of spinners.values()) spinner.stop();

		spinners.clear();
		stepTexts.clear();
		openIds.length = 0;

		if (isNested && event.status === 'ok') return;

		for (const line of formatEnd(event, chalk)) writeLine(line);
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
					onEnd(event);
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
					if (isNested) break;

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
