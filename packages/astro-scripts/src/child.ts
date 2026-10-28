import type { Readable } from 'node:stream';

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { stripVTControlCharacters } from 'node:util';

import type { OutputStream } from './output/events.js';

import { formatDuration } from './output/format.js';
import { emit, getOutputMode, startStatus } from './output/output.js';

interface RunChildOptions {
	cwd?: string;
	filter?: (line: string) => boolean;
	signal?: AbortSignal;
}

type ExitSignal = NodeJS.Signals | null;

class ChildProcessError extends Error {
	exitCode: null | number;
	signal: ExitSignal;

	constructor(argv: Array<string>, exitCode: null | number, signal: ExitSignal) {
		const reason = signal ? `was killed by ${signal}` : `exited with code ${String(exitCode)}`;

		super(`${argv.join(' ')} ${reason}`);
		this.name = 'ChildProcessError';
		this.exitCode = exitCode;
		this.signal = signal;
	}
}

const eventTypes = new Set<unknown>([
	'end',
	'message',
	'output',
	'progress',
	'start',
	'status',
	'summary',
]);

// eslint-disable-next-line no-control-regex -- matching escape sequences is the point
const nonColourSequence = /\u{1B}\[[\d;?]*[A-Za-ln-z]|\u{1B}\][^\u{7}\u{1B}]*(?:\u{7}|\u{1B}\\)/gu;

function isEventLine(line: string) {
	if (!line.startsWith('{')) return false;

	try {
		const parsed: unknown = JSON.parse(line);

		if (typeof parsed !== 'object' || parsed === null) return false;

		return (
			'type' in parsed &&
			eventTypes.has(parsed.type) &&
			'command' in parsed &&
			typeof parsed.command === 'string' &&
			'time' in parsed &&
			typeof parsed.time === 'string'
		);
	} catch {
		return false;
	}
}

async function relayLines(
	input: Readable,
	stream: OutputStream,
	onLine: (line: string, stream: OutputStream) => void,
) {
	const lines = createInterface({ crlfDelay: Infinity, input });

	for await (const line of lines) onLine(line, stream);
}

export async function runChild(
	text: string,
	argv: [string, ...Array<string>],
	{ cwd, filter, signal }: RunChildOptions = {},
) {
	signal?.throwIfAborted();

	const mode = getOutputMode();
	const isPiped = mode === 'json' || filter !== undefined;
	const { id, status } = startStatus(text, argv);
	const startTime = Date.now();
	const [file, ...args] = argv;
	const child = spawn(file, args, {
		cwd,
		env: isPiped && mode === 'pretty' ? { ...process.env, FORCE_COLOR: '1' } : process.env,
		stdio: isPiped ? ['inherit', 'pipe', 'pipe'] : ['inherit', 2, 2],
	});

	function onLine(line: string, stream: OutputStream) {
		if (mode === 'json' && stream === 'stderr' && isEventLine(line)) {
			emit({ line, type: 'nested' });
			return;
		}

		if (filter && !filter(stripVTControlCharacters(line))) return;

		emit({ id, stream, text: line.replaceAll(nonColourSequence, ''), type: 'output' });
	}

	function onAbort() {
		child.kill('SIGTERM');
	}

	function finalText() {
		return `${text} · ${formatDuration(Date.now() - startTime)}`;
	}

	signal?.addEventListener('abort', onAbort, { once: true });

	const relays = [
		...(child.stdout ? [relayLines(child.stdout, 'stdout', onLine)] : []),
		...(child.stderr ? [relayLines(child.stderr, 'stderr', onLine)] : []),
	];

	try {
		const [, [exitCode, exitSignal]] = (await Promise.all([
			Promise.all(relays),
			once(child, 'close'),
		])) as [unknown, [null | number, ExitSignal]];

		if (exitCode !== 0) throw new ChildProcessError(argv, exitCode, exitSignal);

		status.succeed(finalText());
	} catch (error) {
		status.fail(finalText());
		throw error;
	} finally {
		signal?.removeEventListener('abort', onAbort);
	}
}
