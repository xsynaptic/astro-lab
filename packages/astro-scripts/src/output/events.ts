import type { ProgressSnapshot } from './format.js';

export type MessageLevel = 'detail' | 'error' | 'info' | 'step' | 'success' | 'title' | 'warn';

export type StatusState = 'fail' | 'start' | 'stop' | 'succeed' | 'update' | 'warn';

type EndStatus = 'failed' | 'interrupted' | 'ok';

export type SummaryRow = [label: string, value: number | string];

interface StartEvent {
	title: string;
	type: 'start';
}

interface MessageEvent {
	level: MessageLevel;
	text: string;
	type: 'message';
}

interface StatusEvent {
	id: number;
	state: StatusState;
	text: string;
	type: 'status';
}

interface ProgressEvent extends ProgressSnapshot {
	id: number;
	type: 'progress';
}

interface SummaryEvent {
	rows: Array<SummaryRow>;
	type: 'summary';
}

interface DataEvent {
	type: 'data';
	value: unknown;
}

interface EndEvent {
	detail?: string;
	durationMs: number;
	exitCode: number;
	forced?: true;
	message?: string;
	status: EndStatus;
	type: 'end';
}

export type OutputEvent =
	DataEvent | EndEvent | MessageEvent | ProgressEvent | StartEvent | StatusEvent | SummaryEvent;

export interface Reporter {
	emit: (event: OutputEvent) => void;
}

export interface ReporterStreams {
	stderr: NodeJS.WritableStream;
	stdout: NodeJS.WritableStream;
}
