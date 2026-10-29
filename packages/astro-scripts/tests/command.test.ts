import { stripVTControlCharacters } from 'node:util';
import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest';
import { ProcessOutput } from 'zx';

import { readChild, runChild } from '../src/child.js';
import {
	createCommandRunner,
	formatHelp,
	getFailureReport,
	parseNumberOption,
} from '../src/command.js';
import { withStep } from '../src/output/progress.js';
import { UserError } from '../src/user-error.js';

class LibraryUserError extends Error {
	detail?: string;
	override name = 'UserError';

	constructor(message: string, detail?: string) {
		super(message);

		if (detail !== undefined) this.detail = detail;
	}
}

describe('getFailureReport', () => {
	test('reports an abort as an interrupt with the command note, whatever was thrown', () => {
		expect(
			getFailureReport(new Error('fetch aborted'), {
				interrupted: 'progress is saved',
				isAborted: true,
			}),
		).toEqual({ exitCode: 130, isInterrupted: true, message: 'Interrupted; progress is saved' });
	});

	test.each([
		{ error: new ProcessOutput(130), label: 'exited with 130' },
		{ error: new ProcessOutput(undefined, 'SIGINT'), label: 'was killed by SIGINT' },
	])('reports a child that $label as an interrupt', ({ error }) => {
		expect(getFailureReport(error, { isAborted: false })).toMatchObject({
			exitCode: 130,
			isInterrupted: true,
		});
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
	])('reports a user error thrown by $label with its detail', ({ error }) => {
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
	test.each(['  ', 'ten'])('refuses %j rather than reading it as a number', (value) => {
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

	test('lists allowed values under the positional, wrapped to the help width', () => {
		const checks = Array.from({ length: 12 }, (_, index) => `check-number-${String(index)}`);
		const lines = stripVTControlCharacters(
			formatHelp({ ...command, positional: { ...command.positional, choices: checks } }),
		).split('\n');
		const choiceLines = lines.slice(
			6,
			lines.indexOf(lines.find((line) => line.includes('--clear-cache')) ?? ''),
		);

		expect(choiceLines.length).toBeGreaterThan(1);
		expect(choiceLines.every((line) => line.length <= 100)).toBe(true);
		expect(choiceLines.join(' ').split(/,?\s+/).filter(Boolean)).toEqual(checks);
	});
});

describe('runCommand', () => {
	const originalArgv = process.argv;
	const originalOutput = process.env.XSYNAPTIC_SCRIPTS_OUTPUT;
	let stderr: Array<string>;
	let stdout: Array<string>;

	function setArgs(...args: Array<string>) {
		process.argv = ['node', 'script.ts', ...args];
	}

	function readEvents() {
		return stdout
			.join('')
			.split('\n')
			.filter(Boolean)
			.map((line) => JSON.parse(line) as Record<string, unknown>);
	}

	beforeEach(() => {
		stderr = [];
		stdout = [];
		process.env.XSYNAPTIC_SCRIPTS_OUTPUT = 'json';
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
			delete process.env.XSYNAPTIC_SCRIPTS_OUTPUT;
		} else {
			process.env.XSYNAPTIC_SCRIPTS_OUTPUT = originalOutput;
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

	test('rejects a mistyped flag rather than running without it, still as JSON', async () => {
		const run = vi.fn();
		const { runCommand } = createCommandRunner();

		delete process.env.XSYNAPTIC_SCRIPTS_OUTPUT;
		setArgs('--json', '--dry-rn');
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

	test('hands a required positional to the command as a string', async () => {
		const ids: Array<string> = [];
		const { runCommand } = createCommandRunner();

		setArgs('c-42');
		await runCommand({
			name: 'comments-delete',
			positional: { description: 'Comment id', name: 'id', required: true },
			run: ({ positionals }) => {
				ids.push(positionals[0]);
			},
			summary: 'Delete a comment',
			title: 'Comments',
		});

		expect(ids).toEqual(['c-42']);
	});

	test('refuses to run without a required positional, but still prints help', async () => {
		const run = vi.fn();
		const { runCommand } = createCommandRunner();
		const command = {
			name: 'comments-delete',
			positional: { description: 'Comment id', name: 'id', required: true },
			run,
			summary: 'Delete a comment',
			title: 'Comments',
		};

		setArgs();
		await runCommand(command);

		expect(run).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
		expect(readEvents().at(-1)).toMatchObject({
			detail: 'See --help',
			message: 'Missing <id>',
			status: 'failed',
			type: 'end',
		});

		setArgs('--help');
		await runCommand(command);

		expect(stripVTControlCharacters(stdout.join(''))).toContain(
			'Usage: pnpm comments-delete <id> [options]',
		);
	});

	test('refuses a value outside the choices before the context loads', async () => {
		const createContext = vi.fn(() => ({}));
		const checks: Array<string> = [];
		const { runCommand } = createCommandRunner({ context: createContext });
		const command = {
			name: 'validate-content',
			positional: { choices: ['entry-ids', 'images'], description: 'One check', name: 'check' },
			run: ({ positionals }: { positionals: Array<'entry-ids' | 'images'> }) => {
				checks.push(...positionals);
			},
			summary: 'Validate content',
			title: 'Validate',
		} as const;

		setArgs('imgaes');
		await runCommand(command);

		expect(createContext).not.toHaveBeenCalled();
		expect(readEvents().at(-1)).toMatchObject({
			detail: 'Expected one of: entry-ids, images',
			message: 'Unknown check "imgaes"',
			status: 'failed',
		});

		setArgs('images');
		await runCommand(command);

		expect(checks).toEqual(['images']);
	});

	test('types positionals as the declared choices', async () => {
		const { runCommand } = createCommandRunner();

		setArgs();
		await runCommand({
			name: 'validate-content',
			positional: { choices: ['entry-ids', 'images'], description: 'One check', name: 'check' },
			run: ({ positionals }) => {
				expectTypeOf(positionals).toEqualTypeOf<Array<'entry-ids' | 'images'>>();
			},
			summary: 'Validate content',
			title: 'Validate',
		});
	});

	test('stops a child on interrupt without the command passing its signal', async () => {
		const { runCommand } = createCommandRunner();

		setArgs();
		await runCommand({
			name: 'deploy-site',
			run: async () => {
				await runChild(
					'Waiting',
					[
						process.execPath,
						'-e',
						'process.on("SIGTERM", () => { console.log("stopped"); process.exit(130); }); console.log("ready"); setInterval(() => {}, 1000)',
					],
					{
						onLine: (line) => {
							if (line === 'ready') process.emit('SIGINT');
							return true;
						},
					},
				);
			},
			summary: 'Deploy',
			title: 'Deploy',
		});

		const events = readEvents();

		expect(events.filter((event) => event.type === 'output').map((event) => event.text)).toEqual([
			'ready',
			'stopped',
		]);
		expect(events.at(-1)).toMatchObject({ status: 'interrupted', type: 'end' });
	});

	test('ends with the steps that warned or skipped', async () => {
		const { runCommand } = createCommandRunner();

		setArgs();
		await runCommand({
			name: 'deploy-site',
			run: async () => {
				await withStep('Pulling stats', (step) => {
					step.warn();
					return Promise.resolve();
				});
				await withStep('Fetching webmentions', (step) => {
					step.skip();
					return Promise.resolve();
				});
				await withStep('Building', () => Promise.resolve());
			},
			summary: 'Deploy',
			title: 'Deploy',
		});

		expect(readEvents().at(-1)).toMatchObject({
			skipped: ['Fetching webmentions'],
			status: 'ok',
			type: 'end',
			warned: ['Pulling stats'],
		});
	});

	test('drops the literal -- pnpm forwards before the options', async () => {
		const run = vi.fn();
		const { runCommand } = createCommandRunner();

		setArgs('--', '--dry-run');
		await runCommand({
			name: 'deploy-site',
			options: { 'dry-run': { default: false, description: 'Dry run', type: 'boolean' } },
			run: ({ values }) => {
				run(values['dry-run']);
			},
			summary: 'Deploy',
			title: 'Deploy',
		});

		expect(run).toHaveBeenCalledWith(true);
	});

	test('reports a captured child that fails with its output tail', async () => {
		const { runCommand } = createCommandRunner();

		setArgs();
		await runCommand({
			name: 'deploy-app',
			run: async () => {
				await readChild([
					process.execPath,
					'-e',
					'console.error("quota exceeded"); process.exit(2)',
				]);
			},
			summary: 'Deploy',
			title: 'Deploy',
		});

		expect(readEvents().at(-1)).toMatchObject({
			detail: 'quota exceeded',
			message: expect.stringMatching(/exited with code 2$/),
			status: 'failed',
		});
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

	test('reads --json after a second -- separator as a positional, not the flag', async () => {
		const run = vi.fn();
		const { runCommand } = createCommandRunner();

		delete process.env.XSYNAPTIC_SCRIPTS_OUTPUT;
		setArgs('--', '--', '--json');
		await runCommand({
			name: 'improve-content',
			positional: { description: 'One entry by id', name: 'entry' },
			run,
			summary: 'Improve',
			title: 'Improve',
		});

		const [[context]] = run.mock.calls as [[{ positionals: Array<string> }]];

		expect(context.positionals).toEqual(['--json']);
		expect(process.env.XSYNAPTIC_SCRIPTS_OUTPUT).toBeUndefined();
	});

	test('passes json mode on to child processes', async () => {
		const { runCommand } = createCommandRunner();

		delete process.env.XSYNAPTIC_SCRIPTS_OUTPUT;
		setArgs('--json');
		await runCommand({ name: 'probe', run: vi.fn(), summary: 'Probe', title: 'Probe' });

		expect(process.env.XSYNAPTIC_SCRIPTS_OUTPUT).toBe('json');
		expect(readEvents()[0]).toMatchObject({ command: 'probe', title: 'Probe', type: 'start' });
	});
});
