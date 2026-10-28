import type { ProgressSnapshot } from './format.js';

export type MessageLevel = 'detail' | 'error' | 'info' | 'step' | 'success' | 'title' | 'warn';

export type StatusState = 'fail' | 'start' | 'stop' | 'succeed' | 'update' | 'warn';

type EndStatus = 'failed' | 'interrupted' | 'ok';

export type SummaryRow = [label: string, value: number | string];

export type OutputStream = 'stderr' | 'stdout';

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
	argv?: Array<string>;
	durationMs?: number;
	id: number;
	state: StatusState;
	step?: true;
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
	render?: () => string;
	type: 'data';
	value: unknown;
}

interface ChildOutputEvent {
	id: number;
	stream: OutputStream;
	text: string;
	type: 'output';
}

interface NestedEvent {
	line: string;
	type: 'nested';
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
	| ChildOutputEvent
	| DataEvent
	| EndEvent
	| MessageEvent
	| NestedEvent
	| ProgressEvent
	| StartEvent
	| StatusEvent
	| SummaryEvent;

export interface Reporter {
	emit: (event: OutputEvent) => void;
}

export interface ReporterStreams {
	stderr: NodeJS.WritableStream;
	stdout: NodeJS.WritableStream;
}
