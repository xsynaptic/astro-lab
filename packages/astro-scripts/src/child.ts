import type { ChildProcess } from 'node:child_process';
import type { Readable } from 'node:stream';

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { stripVTControlCharacters } from 'node:util';

import type { OutputStream } from './output/events.js';

import { getCommandSignal } from './command.js';
import { emit, getCommandName, getOutputMode } from './output/output.js';
import { runStep } from './output/progress.js';

type Argv = [string, ...Array<string>];

interface ChildOptions {
	cwd?: string;
	env?: Record<string, string | undefined>;
	input?: string;
	signal?: AbortSignal;
}

type LineFilter = (line: string, stream: OutputStream) => boolean;

interface RunChildOptions extends ChildOptions {
	describe?: () => string;
	onLine?: LineFilter;
}

interface CaptureChildOptions extends ChildOptions {
	capture: true;
	describe?: (stdout: string) => string;
	onLine?: LineFilter;
}

interface SpawnChildOptions extends ChildOptions {
	capture?: boolean;
	onLine?: LineFilter;
}

interface ReadChildOptions extends ChildOptions {
	allowFailure?: boolean;
}

export interface ChildResult {
	exitCode: null | number;
	stderr: string;
	stdout: string;
}

type ExitSignal = NodeJS.Signals | null;

class ChildProcessError extends Error {
	exitCode: null | number;
	signal: ExitSignal;
	stderr?: string;
	stdout?: string;

	constructor(
		argv: Array<string>,
		{ exitCode, signal }: { exitCode: null | number; signal: ExitSignal },
		output?: { stderr: string; stdout: string },
	) {
		const reason = signal ? `was killed by ${signal}` : `exited with code ${String(exitCode)}`;

		super(`${argv.join(' ')} ${reason}`);
		this.name = 'ChildProcessError';
		this.exitCode = exitCode;
		this.signal = signal;

		if (output) {
			this.stderr = output.stderr;
			this.stdout = output.stdout;
		}
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

function parseEventLine(line: string) {
	if (!line.startsWith('{')) return;

	try {
		const parsed: unknown = JSON.parse(line);

		if (typeof parsed !== 'object' || parsed === null) return;

		const isEvent =
			'type' in parsed &&
			eventTypes.has(parsed.type) &&
			'command' in parsed &&
			typeof parsed.command === 'string' &&
			'time' in parsed &&
			typeof parsed.time === 'string';

		return isEvent ? parsed : undefined;
	} catch {
		return;
	}
}

function withParent(line: string, event: object, id: number) {
	if ('parent' in event) return line;

	return JSON.stringify({ ...event, parent: { command: getCommandName(), id } });
}

function getChildEnv(env: ChildOptions['env'], extra: Record<string, string>) {
	return { ...process.env, ...env, ...extra };
}

function writeInput(child: ChildProcess, input: string | undefined) {
	if (input !== undefined) child.stdin?.end(input);
}

function forwardAbort(child: ChildProcess, signal: AbortSignal | undefined) {
	function onAbort() {
		child.kill('SIGTERM');
	}

	signal?.addEventListener('abort', onAbort, { once: true });

	return () => {
		signal?.removeEventListener('abort', onAbort);
	};
}

async function relayLines(
	input: Readable,
	stream: OutputStream,
	onLine: (line: string, stream: OutputStream) => void,
) {
	const lines = createInterface({ crlfDelay: Infinity, input });

	for await (const line of lines) onLine(line, stream);
}

async function readStream(input: null | Readable) {
	if (!input) return '';

	input.setEncoding('utf8');

	let text = '';

	for await (const chunk of input) text += String(chunk);

	return text;
}

async function spawnChild(
	id: number,
	argv: Argv,
	{ capture = false, cwd, env, input, onLine }: SpawnChildOptions,
	signal: AbortSignal | undefined,
) {
	const mode = getOutputMode();
	const isPiped = mode === 'json' || onLine !== undefined || capture;
	const stdout: Array<string> = [];
	const [file, ...args] = argv;
	const child = spawn(file, args, {
		cwd,
		env: getChildEnv(env, {
			...(isPiped && mode === 'pretty' ? { FORCE_COLOR: '1' } : {}),
			SCRIPTS_NESTED: '1',
		}),
		stdio: [input === undefined ? 'inherit' : 'pipe', isPiped ? 'pipe' : 2, isPiped ? 'pipe' : 2],
	});

	function relayLine(line: string, stream: OutputStream) {
		const event = mode === 'json' && stream === 'stderr' ? parseEventLine(line) : undefined;

		if (event) {
			emit({ line: withParent(line, event, id), type: 'nested' });
			return;
		}

		const plainLine = stripVTControlCharacters(line);

		if (capture && stream === 'stdout') stdout.push(plainLine);

		if (onLine && !onLine(plainLine, stream)) return;

		emit({ id, stream, text: line.replaceAll(nonColourSequence, ''), type: 'output' });
	}

	const stopForwarding = forwardAbort(child, signal);

	writeInput(child, input);

	const relays = [
		...(child.stdout ? [relayLines(child.stdout, 'stdout', relayLine)] : []),
		...(child.stderr ? [relayLines(child.stderr, 'stderr', relayLine)] : []),
	];

	try {
		const [, [exitCode, exitSignal]] = (await Promise.all([
			Promise.all(relays),
			once(child, 'close'),
		])) as [unknown, [null | number, ExitSignal]];

		if (exitCode !== 0) throw new ChildProcessError(argv, { exitCode, signal: exitSignal });

		return stdout.join('\n');
	} finally {
		stopForwarding();
	}
}

export async function runChild(
	text: string,
	argv: Argv,
	options: CaptureChildOptions,
): Promise<string>;
export async function runChild(text: string, argv: Argv, options?: RunChildOptions): Promise<void>;
export async function runChild(
	text: string,
	argv: Argv,
	options: CaptureChildOptions | RunChildOptions = {},
): Promise<string | void> {
	const signal = options.signal ?? getCommandSignal();

	signal?.throwIfAborted();

	const stdout = await runStep(text, ({ id }) => spawnChild(id, argv, options, signal), {
		argv,
		describe: options.describe,
	});

	return 'capture' in options ? stdout : undefined;
}

export async function readChild(
	argv: Argv,
	{ allowFailure = false, cwd, env, input, signal = getCommandSignal() }: ReadChildOptions = {},
): Promise<ChildResult> {
	signal?.throwIfAborted();

	const [file, ...args] = argv;
	const child = spawn(file, args, {
		cwd,
		env: getChildEnv(env, {}),
		stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
	});
	const stopForwarding = forwardAbort(child, signal);

	writeInput(child, input);

	try {
		const [stdout, stderr, [exitCode, exitSignal]] = (await Promise.all([
			readStream(child.stdout),
			readStream(child.stderr),
			once(child, 'close'),
		])) as [string, string, [null | number, ExitSignal]];

		signal?.throwIfAborted();

		if (exitCode !== 0 && !allowFailure) {
			throw new ChildProcessError(argv, { exitCode, signal: exitSignal }, { stderr, stdout });
		}

		return { exitCode, stderr, stdout };
	} finally {
		stopForwarding();
	}
}
