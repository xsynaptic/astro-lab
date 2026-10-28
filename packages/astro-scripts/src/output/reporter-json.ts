import { stripVTControlCharacters } from 'node:util';

import type { OutputEvent, Reporter, ReporterStreams } from './events.js';

type ProgressEvent = Extract<OutputEvent, { type: 'progress' }>;

interface JsonReporterOptions {
	command?: string | undefined;
	isNested?: boolean;
	now?: () => number;
}

interface Throttle {
	lastSent: number;
	pending?: ProgressEvent;
}

const throttleMs = 1000;

function strip(text: string): string;
function strip(text: string | undefined): string | undefined;
function strip(text: string | undefined) {
	return text === undefined ? undefined : stripVTControlCharacters(text);
}

function stripEvent(event: OutputEvent): OutputEvent {
	switch (event.type) {
		case 'data':
		case 'nested': {
			return event;
		}
		case 'end': {
			const { detail, message, ...rest } = event;

			return {
				...rest,
				...(detail === undefined ? {} : { detail: strip(detail) }),
				...(message === undefined ? {} : { message: strip(message) }),
			};
		}
		case 'message':
		case 'output':
		case 'status': {
			return { ...event, text: strip(event.text) };
		}
		case 'progress': {
			const { note, ...rest } = event;

			return { ...rest, label: strip(event.label), ...(note ? { note: strip(note) } : {}) };
		}
		case 'start': {
			return { ...event, title: strip(event.title) };
		}
		case 'summary': {
			return {
				...event,
				rows: event.rows.map(([label, value]) => [
					strip(label),
					typeof value === 'string' ? strip(value) : value,
				]),
			};
		}
	}
}

export function createJsonReporter(
	{ stderr, stdout }: ReporterStreams,
	{ command, isNested = false, now = Date.now }: JsonReporterOptions = {},
): Reporter {
	const progressThrottles = new Map<number, Throttle>();
	const updateThrottles = new Map<number, Throttle>();

	function write(event: OutputEvent) {
		const { type, ...payload } = stripEvent(event);
		const envelope = { command, time: new Date(now()).toISOString() };

		stderr.write(`${JSON.stringify({ type, ...envelope, ...payload })}\n`);
	}

	function isDue(throttles: Map<number, Throttle>, id: number) {
		const time = now();
		const throttle = throttles.get(id);

		if (throttle && time - throttle.lastSent < throttleMs) return false;

		throttles.set(id, { lastSent: time });

		return true;
	}

	return {
		emit(event) {
			if (isNested && event.type === 'data') {
				write(event);
				return;
			}

			if (event.type === 'data') {
				stdout.write(`${JSON.stringify(event.value)}\n`);
				return;
			}

			if (event.type === 'nested') {
				stderr.write(`${event.line}\n`);
				return;
			}

			if (event.type === 'progress') {
				if (isDue(progressThrottles, event.id)) {
					write(event);
					return;
				}

				const throttle = progressThrottles.get(event.id);

				if (throttle) throttle.pending = event;
				return;
			}

			if (event.type === 'status' && event.state === 'update') {
				if (isDue(updateThrottles, event.id)) write(event);
				return;
			}

			if (event.type === 'status' && event.state !== 'start') {
				const pending = progressThrottles.get(event.id)?.pending;

				if (pending) write(pending);

				progressThrottles.delete(event.id);
				updateThrottles.delete(event.id);
			}

			write(event);
		},
	};
}
