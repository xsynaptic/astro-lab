import type { MessageLevel, OutputEvent, Reporter, SummaryRow } from './events.js';

import { createJsonReporter } from './reporter-json.js';
import { createPlainReporter } from './reporter-plain.js';
import { createPrettyReporter } from './reporter-pretty.js';

export type OutputMode = 'json' | 'plain' | 'pretty';

let currentCommand: string | undefined;
let currentMode: OutputMode | undefined;
let currentReporter: Reporter | undefined;
let capturingReporter: Reporter | undefined;
let nextStatusId = 1;

function detectOutputMode(): OutputMode {
	if (process.env.XSYNAPTIC_SCRIPTS_OUTPUT === 'json') return 'json';

	return process.stderr.isTTY && process.stderr.columns > 0 ? 'pretty' : 'plain';
}

function createReporter(mode: OutputMode, command?: string) {
	const streams = { stderr: process.stderr, stdout: process.stdout };

	if (mode === 'json') return createJsonReporter(streams, { command });

	const isNested = process.env.XSYNAPTIC_SCRIPTS_NESTED === '1';

	if (mode === 'plain') return createPlainReporter(streams, { isNested });

	return createPrettyReporter(streams, { isNested });
}

export function configureOutput(mode: OutputMode = detectOutputMode(), command?: string) {
	currentCommand = command;
	currentMode = mode;
	currentReporter = createReporter(mode, command);
}

export function getCommandName() {
	return currentCommand;
}

export function getOutputMode() {
	if (currentMode === undefined) currentMode = detectOutputMode();

	return currentMode;
}

export function emit(event: OutputEvent) {
	if (capturingReporter) {
		capturingReporter.emit(event);
		return;
	}

	if (currentReporter === undefined) currentReporter = createReporter(getOutputMode());

	currentReporter.emit(event);
}

export async function captureOutput<Result>(task: () => Promise<Result> | Result) {
	const events: Array<OutputEvent> = [];
	const previous = capturingReporter;

	capturingReporter = {
		emit(event) {
			events.push(event);
		},
	};

	try {
		const result = await task();

		return { events, result };
	} finally {
		capturingReporter = previous;
	}
}

function emitMessage(level: MessageLevel, text: string) {
	emit({ level, text, type: 'message' });
}

// Arrow properties, not methods, so consumers can pass members as values under `unbound-method`
export const log = {
	data: <Value>(value: Value, format?: (value: Value) => string) => {
		emit(format ? { render: () => format(value), type: 'data', value } : { type: 'data', value });
	},
	detail: (text: string) => {
		emitMessage('detail', text);
	},
	error: (text: string) => {
		emitMessage('error', text);
	},
	info: (text: string) => {
		emitMessage('info', text);
	},
	step: (text: string) => {
		emitMessage('step', text);
	},
	success: (text: string) => {
		emitMessage('success', text);
	},
	summary: (rows: Array<SummaryRow>) => {
		emit({ rows, type: 'summary' });
	},
	title: (text: string) => {
		emitMessage('title', text);
	},
	warn: (text: string) => {
		emitMessage('warn', text);
	},
};

export interface Status {
	fail: (finalText?: string) => void;
	stop: () => void;
	succeed: (finalText?: string) => void;
	update: (nextText: string) => void;
	warn: (finalText?: string) => void;
}

export type ClosingState = 'fail' | 'skip' | 'succeed' | 'warn';

export interface StepOutcome {
	state: 'skip' | 'warn';
	text: string;
}

interface StepOptions {
	argv?: Array<string>;
}

let stepOutcomes: Array<StepOutcome> | undefined;

export function trackStepOutcomes() {
	const previous = stepOutcomes;
	const outcomes: Array<StepOutcome> = [];

	stepOutcomes = outcomes;

	return {
		outcomes,
		restore: () => {
			stepOutcomes = previous;
		},
	};
}

export function recordStepOutcome(outcome: StepOutcome) {
	stepOutcomes?.push(outcome);
}

export function startStatus(initialText: string, step?: StepOptions) {
	const id = nextStatusId;
	const startTime = Date.now();
	let text = initialText;

	nextStatusId += 1;
	emit({
		...(step ? { step: true } : {}),
		...(step?.argv ? { argv: step.argv } : {}),
		id,
		state: 'start',
		text,
		type: 'status',
	});

	function close(state: ClosingState, finalText?: string, detail?: string) {
		text = finalText ?? text;
		emit({
			...(detail === undefined ? {} : { detail }),
			durationMs: Date.now() - startTime,
			id,
			state,
			text,
			type: 'status',
		});
	}

	const status: Status = {
		fail: (finalText) => {
			close('fail', finalText);
		},
		stop: () => {
			emit({ id, state: 'stop', text, type: 'status' });
		},
		succeed: (finalText) => {
			close('succeed', finalText);
		},
		update: (nextText) => {
			text = nextText;
			emit({ id, state: 'update', text, type: 'status' });
		},
		warn: (finalText) => {
			close('warn', finalText);
		},
	};

	return { close, id, status };
}

export function createStatus(text: string) {
	return startStatus(text).status;
}
