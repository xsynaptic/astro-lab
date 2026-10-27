import { parseArgs, stripVTControlCharacters } from 'node:util';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ProcessOutput } from 'zx';

import {
	createCommandRunner,
	formatHelp,
	getFailureReport,
	parseNumberOption,
} from '../src/command.js';
import { UserError } from '../src/user-error.js';

class LibraryUserError extends Error {
	detail?: string;
	override name = 'UserError';

	constructor(message: string, detail?: string) {
		super(message);

		if (detail !== undefined) this.detail = detail;
	}
}

function getParseError() {
	try {
		parseArgs({ args: ['--dry-rn'], options: { 'dry-run': { type: 'boolean' } }, strict: true });
	} catch (error) {
		return error;
	}

	throw new Error('Expected parseArgs to reject the flag');
}

describe('getFailureReport', () => {
	test('points a mistyped flag at --help', () => {
		expect(getFailureReport(getParseError(), { isAborted: false })).toMatchObject({
			detail: 'See --help',
			exitCode: 1,
			isInterrupted: false,
			message: expect.stringContaining("Unknown option '--dry-rn'") as string,
		});
	});

	test('reports an abort as an interrupt with the command note, whatever was thrown', () => {
		expect(
			getFailureReport(new Error('fetch aborted'), {
				interrupted: 'progress is saved',
				isAborted: true,
			}),
		).toEqual({ exitCode: 130, isInterrupted: true, message: 'Interrupted; progress is saved' });
	});

	test('reports a child that exited on Ctrl-C as an interrupt', () => {
		expect(getFailureReport(new ProcessOutput(130), { isAborted: false })).toMatchObject({
			exitCode: 130,
			isInterrupted: true,
		});
	});

	test('reports a child killed by SIGINT as an interrupt', () => {
		expect(
			getFailureReport(new ProcessOutput(undefined, 'SIGINT'), { isAborted: false }),
		).toMatchObject({ exitCode: 130, isInterrupted: true });
	});

	test('reports a child that inherited stdio by exit code alone, its stderr already printed', () => {
		expect(getFailureReport(new ProcessOutput(2, undefined, '', ''), { isAborted: false })).toEqual(
			{ exitCode: 1, isInterrupted: false, message: 'Child process exited with code 2' },
		);
	});

	test('reports the last 20 lines of the stderr a failed child captured', () => {
		const lines = Array.from({ length: 25 }, (_, index) => `line ${String(index + 1)}`);
		const error = new ProcessOutput(1, undefined, '', `${lines.join('\n')}\n`);

		expect(getFailureReport(error, { isAborted: false })).toEqual({
			detail: lines.slice(5).join('\n'),
			exitCode: 1,
			isInterrupted: false,
			message: 'Child process exited with code 1',
		});
	});

	test('reports a child killed by a signal other than SIGINT as a failure', () => {
		expect(getFailureReport(new ProcessOutput(undefined, 'SIGKILL'), { isAborted: false })).toEqual(
			{
				exitCode: 1,
				isInterrupted: false,
				message: 'Child process was killed by SIGKILL',
			},
		);
	});

	test.each([
		{ error: new UserError('Build first'), label: 'ours' },
		{ error: new LibraryUserError('Build first'), label: 'a library, whose class is its own' },
	])('reports a user error thrown by $label by its message alone', ({ error }) => {
		expect(getFailureReport(error, { isAborted: false })).toEqual({
			exitCode: 1,
			isInterrupted: false,
			message: 'Build first',
		});
	});

	test.each([
		{
			error: new UserError('Caddy did not reload', {
				detail: 'Caddy log: bind: address already in use',
			}),
			label: 'ours',
		},
		{
			error: new LibraryUserError(
				'Caddy did not reload',
				'Caddy log: bind: address already in use',
			),
			label: 'a library',
		},
	])('reports the detail a user error thrown by $label carries', ({ error }) => {
		expect(getFailureReport(error, { isAborted: false })).toEqual({
			detail: 'Caddy log: bind: address already in use',
			exitCode: 1,
			isInterrupted: false,
			message: 'Caddy did not reload',
		});
	});

	test('keeps the stack of an unexpected error', () => {
		const report = getFailureReport(new TypeError('boom'), { isAborted: false });

		expect(report.message).toBe('boom');
		expect(report.detail).toContain('command.test.ts');
	});
});

describe('parseNumberOption', () => {
	test.each(['', '  ', 'ten'])('refuses %j rather than reading it as a number', (value) => {
		expect(() => parseNumberOption(value, 'limit')).toThrow(UserError);
	});
});

describe('formatHelp', () => {
	const command = {
		name: 'render-images',
		options: {
			'clear-cache': { default: false, description: 'Render from scratch', type: 'boolean' },
			threshold: { default: '10', description: 'Distance in meters', type: 'string' },
		},
		positional: { description: 'One check by name', name: 'check' },
		summary: 'Encode renditions',
		title: 'Images',
	} as const;

	test('lists the positional, options with their defaults, then the built-in flags', () => {
		const lines = stripVTControlCharacters(formatHelp(command)).split('\n');

		expect(lines.slice(0, 4)).toEqual([
			'Images',
			'Encode renditions',
			'',
			'Usage: pnpm render-images [check] [options]',
		]);
		expect(lines.slice(5).map((line) => line.trim().split(/\s{2,}/))).toEqual([
			['check', 'One check by name'],
			['--clear-cache', 'Render from scratch'],
			['--threshold <value>', 'Distance in meters (default: 10)'],
			['--json', 'Print output as JSON lines'],
			['-h, --help', 'Show this help'],
		]);
	});

	test('takes a usage prefix for commands invoked through a filter', () => {
		const lines = formatHelp(command, 'pnpm --filter @mta/scripts').split('\n');

		expect(lines[3]).toBe('Usage: pnpm --filter @mta/scripts render-images [check] [options]');
	});
});

describe('runCommand', () => {
	const originalArgv = process.argv;
	const originalOutput = process.env.SCRIPTS_OUTPUT;
	let stderr: Array<string>;
	let stdout: Array<string>;

	function setArgs(...args: Array<string>) {
		process.argv = ['node', 'script.ts', ...args];
	}

	function readEvents() {
		return stderr.map((line) => JSON.parse(line) as Record<string, unknown>);
	}

	beforeEach(() => {
		stderr = [];
		stdout = [];
		process.env.SCRIPTS_OUTPUT = 'json';
		vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
			stderr.push(...String(chunk).split('\n').filter(Boolean));
			return true;
		});
		vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
			stdout.push(String(chunk));
			return true;
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		process.argv = originalArgv;
		process.exitCode = undefined;

		if (originalOutput === undefined) {
			delete process.env.SCRIPTS_OUTPUT;
		} else {
			process.env.SCRIPTS_OUTPUT = originalOutput;
		}
	});

	test('merges the project context with parsed options and the workspace root', async () => {
		const run = vi.fn();
		const { runCommand } = createCommandRunner({
			context: async ({ rootPath }) => {
				await Promise.resolve();

				return { cachePath: `${rootPath}/.cache` };
			},
		});

		setArgs('--limit', '5');
		await runCommand({
			name: 'probe',
			options: { limit: { description: 'Most to check', type: 'string' } },
			run,
			summary: 'Probe',
			title: 'Probe',
		});

		const [[context]] = run.mock.calls as [[{ cachePath: string; rootPath: string }]];

		expect(context).toMatchObject({ positionals: [], values: { limit: '5' } });
		expect(context.cachePath).toBe(`${context.rootPath}/.cache`);
		expect(readEvents().map((event) => [event.type, event.command])).toEqual([
			['start', 'probe'],
			['end', 'probe'],
		]);
	});

	test('prints help to stdout without starting the command or its context', async () => {
		const context = vi.fn(() => ({}));
		const run = vi.fn();
		const { runCommand } = createCommandRunner({ context });

		setArgs('--help');
		await runCommand({ name: 'probe', run, summary: 'Probe things', title: 'Probe' });

		expect(stripVTControlCharacters(stdout.join(''))).toContain('Usage: pnpm probe [options]');
		expect(context).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
		expect(stderr).toEqual([]);
	});

	test('rejects a mistyped flag rather than running without it', async () => {
		const run = vi.fn();
		const { runCommand } = createCommandRunner();

		setArgs('--dry-rn');
		await runCommand({
			name: 'deploy',
			options: { 'dry-run': { description: 'Print the plan', type: 'boolean' } },
			run,
			summary: 'Deploy',
			title: 'Deploy',
		});

		expect(run).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
		expect(readEvents()).toEqual([
			expect.objectContaining({ title: 'Deploy', type: 'start' }),
			expect.objectContaining({ detail: 'See --help', exitCode: 1, status: 'failed', type: 'end' }),
		]);
	});

	test('refuses an unknown SCRIPTS_OUTPUT rather than guessing', async () => {
		const run = vi.fn();
		const { runCommand } = createCommandRunner();

		process.env.SCRIPTS_OUTPUT = 'jsno';
		setArgs();
		await runCommand({ name: 'probe', run, summary: 'Probe', title: 'Probe' });

		expect(run).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
		expect(stripVTControlCharacters(stderr.join('\n'))).toContain(
			'SCRIPTS_OUTPUT must be pretty, plain or json, got "jsno"',
		);
	});

	test('reports an interrupted command as interrupted even when it returns normally', async () => {
		const { runCommand } = createCommandRunner();

		setArgs();
		await runCommand({
			name: 'probe',
			run: () => {
				process.emit('SIGINT');
			},
			summary: 'Probe',
			title: 'Probe',
		});

		expect(process.exitCode).toBe(130);
		expect(readEvents().at(-1)).toMatchObject({
			exitCode: 130,
			status: 'interrupted',
			type: 'end',
		});
	});

	test('reports a parse error as a JSON stream that still opens with start', async () => {
		const { runCommand } = createCommandRunner();

		delete process.env.SCRIPTS_OUTPUT;
		setArgs('--json', '--dry-rn');
		await runCommand({ name: 'probe', run: vi.fn(), summary: 'Probe', title: 'Probe' });

		expect(readEvents()).toEqual([
			expect.objectContaining({ command: 'probe', type: 'start' }),
			expect.objectContaining({ command: 'probe', status: 'failed', type: 'end' }),
		]);
	});

	test('reads --json after the -- separator as a positional, not the flag', async () => {
		const run = vi.fn();
		const { runCommand } = createCommandRunner();

		delete process.env.SCRIPTS_OUTPUT;
		setArgs('--', '--json');
		await runCommand({
			name: 'improve-content',
			positional: { description: 'One entry by id', name: 'entry' },
			run,
			summary: 'Improve',
			title: 'Improve',
		});

		const [[context]] = run.mock.calls as [[{ positionals: Array<string> }]];

		expect(context.positionals).toEqual(['--json']);
		expect(process.env.SCRIPTS_OUTPUT).toBeUndefined();
	});

	test('passes json mode on to child processes', async () => {
		const { runCommand } = createCommandRunner();

		delete process.env.SCRIPTS_OUTPUT;
		setArgs('--json');
		await runCommand({ name: 'probe', run: vi.fn(), summary: 'Probe', title: 'Probe' });

		expect(process.env.SCRIPTS_OUTPUT).toBe('json');
		expect(readEvents()[0]).toMatchObject({ command: 'probe', title: 'Probe', type: 'start' });
	});
});
