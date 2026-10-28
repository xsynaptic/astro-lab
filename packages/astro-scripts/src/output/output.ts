import type { MessageLevel, OutputEvent, Reporter, SummaryRow } from './events.js';

import { createJsonReporter } from './reporter-json.js';
import { createPlainReporter } from './reporter-plain.js';
import { createPrettyReporter } from './reporter-pretty.js';

export type OutputMode = 'json' | 'plain' | 'pretty';

const outputModes = new Set<unknown>(['json', 'plain', 'pretty'] satisfies Array<OutputMode>);

let currentMode: OutputMode | undefined;
let currentReporter: Reporter | undefined;
let capturingReporter: Reporter | undefined;
let nextStatusId = 1;

export function isOutputMode(value: unknown): value is OutputMode {
	return outputModes.has(value);
}

function detectOutputMode(): OutputMode {
	const requested = process.env.SCRIPTS_OUTPUT;

	if (isOutputMode(requested)) return requested;

	return process.stderr.isTTY ? 'pretty' : 'plain';
}

function createReporter(mode: OutputMode, command?: string) {
	const streams = { stderr: process.stderr, stdout: process.stdout };

	if (mode === 'json') return createJsonReporter(streams, { command });
	if (mode === 'plain') return createPlainReporter(streams);

	return createPrettyReporter(streams);
}

export function configureOutput(mode: OutputMode = detectOutputMode(), command?: string) {
	currentMode = mode;
	currentReporter = createReporter(mode, command);
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

export function startStatus(initialText: string) {
	const id = nextStatusId;
	let text = initialText;

	nextStatusId += 1;
	emit({ id, state: 'start', text, type: 'status' });

	function finish(state: 'fail' | 'stop' | 'succeed' | 'warn', finalText?: string) {
		text = finalText ?? text;
		emit({ id, state, text, type: 'status' });
	}

	const status: Status = {
		fail: (finalText) => {
			finish('fail', finalText);
		},
		stop: () => {
			finish('stop');
		},
		succeed: (finalText) => {
			finish('succeed', finalText);
		},
		update: (nextText) => {
			text = nextText;
			emit({ id, state: 'update', text, type: 'status' });
		},
		warn: (finalText) => {
			finish('warn', finalText);
		},
	};

	return { id, status };
}

export function createStatus(text: string) {
	return startStatus(text).status;
}
