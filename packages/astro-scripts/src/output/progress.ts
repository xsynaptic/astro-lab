import type { ProgressSnapshot } from './format.js';

import { formatProgressText } from './format.js';
import { createStatus, emit, recordStepOutcome, startStatus } from './output.js';

export interface Progress {
	fail: (text?: string) => void;
	succeed: (text?: string) => void;
	tick: (count?: number) => void;
	warn: (text?: string) => void;
}

export interface Step {
	skip: (reason?: string) => void;
	warn: (detail?: string) => void;
}

interface StepHandle extends Step {
	id: number;
}

interface ProgressOptions {
	label: string;
	note?: () => string;
	total: number;
}

interface RateSample {
	count: number;
	time: number;
}

const renderIntervalMs = 100;
const rateWindowMs = 10_000;

export function createRateWindow(windowMs = rateWindowMs) {
	const samples: Array<RateSample> = [];

	return {
		add(count: number, time: number) {
			samples.push({ count, time });

			while (samples.length > 2 && time - (samples[0]?.time ?? time) > windowMs) samples.shift();
		},
		perSecond() {
			const first = samples.at(0);
			const last = samples.at(-1);

			if (!first || !last || last.time <= first.time) return;

			return ((last.count - first.count) * 1000) / (last.time - first.time);
		},
	};
}

export function createProgress({ label, note, total }: ProgressOptions) {
	const rateWindow = createRateWindow();
	const startTime = Date.now();
	let done = 0;
	let lastRender = 0;

	rateWindow.add(0, startTime);

	function getSnapshot(): ProgressSnapshot {
		const noteText = note?.();
		const perSecond = rateWindow.perSecond();

		return {
			done,
			label,
			total,
			...(noteText ? { note: noteText } : {}),
			...(perSecond === undefined ? {} : { perSecond }),
		};
	}

	const { id, status } = startStatus(formatProgressText(getSnapshot()));

	function render() {
		const now = Date.now();

		if (now - lastRender < renderIntervalMs) return;

		lastRender = now;
		rateWindow.add(done, now);
		emit({ id, type: 'progress', ...getSnapshot() });
	}

	function finish(state: 'fail' | 'succeed' | 'warn', text?: string) {
		rateWindow.add(done, Date.now());

		const snapshot = getSnapshot();

		emit({ id, type: 'progress', ...snapshot });
		status[state](text ?? formatProgressText(snapshot));
	}

	const progress: Progress = {
		fail: (text) => {
			finish('fail', text);
		},
		succeed: (text) => {
			finish('succeed', text);
		},
		tick: (count = 1) => {
			done += count;
			render();
		},
		warn: (text) => {
			finish('warn', text);
		},
	};

	return progress;
}

interface StepOutcomeState {
	details: Array<string>;
	state: 'skip' | 'warn';
}

interface RunStepOptions<Result> {
	argv?: Array<string>;
	describe?: ((result: Result) => string) | undefined;
}

function getOutcomeDetail({ details }: StepOutcomeState) {
	return details.length === 0 ? undefined : details.join('\n');
}

export async function runStep<Result>(
	text: string,
	task: (step: StepHandle) => Promise<Result>,
	{ argv, describe }: RunStepOptions<Result> = {},
) {
	const { close, id } = startStatus(text, argv ? { argv } : {});
	let outcome: StepOutcomeState | undefined;

	function flag(state: StepOutcomeState['state'], detail: string | undefined) {
		if (state === 'skip' && outcome?.state === 'warn') return;

		if (outcome?.state !== state) outcome = { details: [], state };

		if (detail !== undefined) outcome.details.push(detail);
	}

	try {
		const result = await task({
			id,
			skip: (reason) => {
				flag('skip', reason);
			},
			warn: (detail) => {
				flag('warn', detail);
			},
		});

		if (outcome?.state === 'skip') {
			recordStepOutcome({ state: 'skip', text });
			close('skip', text, getOutcomeDetail(outcome));
			return result;
		}

		const finalText = describe?.(result);

		if (outcome?.state === 'warn') {
			recordStepOutcome({ state: 'warn', text });
			close('warn', finalText, getOutcomeDetail(outcome));
			return result;
		}

		close('succeed', finalText);

		return result;
	} catch (error) {
		close('fail', text);
		throw error;
	}
}

export async function withStep<Result>(
	text: string,
	task: (step: Step) => Promise<Result>,
	describe?: (result: Result) => string,
) {
	return runStep(text, task, { describe });
}

export async function withSpinner<Result>(
	text: string,
	task: () => Promise<Result>,
	describe?: (result: Result) => string,
) {
	const status = createStatus(text);

	try {
		const result = await task();

		status.succeed(describe?.(result) ?? text);

		return result;
	} catch (error) {
		status.fail(text);
		throw error;
	}
}
