import type { ProgressSnapshot } from './format.js';

import { formatProgressText } from './format.js';
import { createStatus, emit, startStatus } from './output.js';

export interface Progress {
	fail: (text?: string) => void;
	succeed: (text?: string) => void;
	tick: (count?: number) => void;
	warn: (text?: string) => void;
}

export interface Step {
	warn: () => void;
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

// A failure leaves the status open for `runCommand` to mark as failed
export async function withStatus<Result>(text: string, task: () => Promise<Result>) {
	const status = createStatus(text);
	const result = await task();

	status.stop();

	return result;
}

export async function runStep<Result>(
	text: string,
	task: (step: StepHandle) => Promise<Result>,
	argv?: Array<string>,
) {
	const { id } = startStatus(text, argv ? { argv } : {});
	const startTime = Date.now();
	let closingState: 'succeed' | 'warn' = 'succeed';

	function close(state: 'fail' | 'succeed' | 'warn') {
		emit({ durationMs: Date.now() - startTime, id, state, text, type: 'status' });
	}

	try {
		const result = await task({
			id,
			warn: () => {
				closingState = 'warn';
			},
		});

		close(closingState);

		return result;
	} catch (error) {
		close('fail');
		throw error;
	}
}

export async function withStep<Result>(text: string, task: (step: Step) => Promise<Result>) {
	return runStep(text, task);
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
