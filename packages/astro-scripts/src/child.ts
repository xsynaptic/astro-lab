import type { Readable } from 'node:stream';

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { stripVTControlCharacters } from 'node:util';

import type { OutputStream } from './output/events.js';

import { getCommandSignal } from './command.js';
import { emit, getOutputMode } from './output/output.js';
import { runStep } from './output/progress.js';

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
	'data',
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

async function spawnChild(
	id: number,
	argv: [string, ...Array<string>],
	{ cwd, filter }: RunChildOptions,
	signal: AbortSignal | undefined,
) {
	const mode = getOutputMode();
	const isPiped = mode === 'json' || filter !== undefined;
	const [file, ...args] = argv;
	const child = spawn(file, args, {
		cwd,
		env: {
			...process.env,
			...(isPiped && mode === 'pretty' ? { FORCE_COLOR: '1' } : {}),
			SCRIPTS_NESTED: '1',
		},
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
	} finally {
		signal?.removeEventListener('abort', onAbort);
	}
}

export async function runChild(
	text: string,
	argv: [string, ...Array<string>],
	options: RunChildOptions = {},
) {
	const signal = options.signal ?? getCommandSignal();

	signal?.throwIfAborted();

	await runStep(text, (id) => spawnChild(id, argv, options, signal), argv);
}
