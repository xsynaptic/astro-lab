import type { ParseArgsOptionDescriptor } from 'node:util';

import chalk from 'chalk';
import { parseArgs } from 'node:util';

import { configureOutput, emit, isOutputMode, log } from './output/output.js';
import { isRefusal, Refusal } from './refusal.js';
import { findWorkspaceRoot } from './workspace.js';

type CommandOption = ParseArgsOptionDescriptor & { description: string };

type CommandOptions = Record<string, CommandOption>;

interface CommandPositional {
	description: string;
	name: string;
}

type ParsedValues<Options extends CommandOptions> = ReturnType<
	typeof parseArgs<{ allowPositionals: true; options: Options; strict: true }>
>['values'];

interface CommandDescription {
	name: string;
	options?: CommandOptions;
	positional?: CommandPositional;
	summary: string;
	title: string;
}

export interface CommandContext<Options extends CommandOptions> {
	positionals: Array<string>;
	rootPath: string;
	signal: AbortSignal;
	values: ParsedValues<Options>;
}

export interface Command<Options extends CommandOptions, Context> extends CommandDescription {
	interrupted?: string;
	options?: Options;
	run: (context: CommandContext<Options> & Context) => Promise<void> | void;
}

interface CommandRunnerOptions<Context> {
	context?: (base: { rootPath: string }) => Context | Promise<Context>;
	usagePrefix?: string;
}

interface ChildProcessFailure extends Error {
	exitCode: null | number | undefined;
	signal: null | string | undefined;
}

interface FailureReport {
	detail?: string;
	exitCode: number;
	isInterrupted: boolean;
	message: string;
}

const interruptedExitCode = 130;
const interruptBurstMs = 1000;

const jsonOption = {
	description: 'Print output as JSON lines',
	type: 'boolean',
} as const satisfies CommandOption;

const helpOption = {
	description: 'Show this help',
	short: 'h',
	type: 'boolean',
} as const satisfies CommandOption;

const builtInOptions: Array<[string, CommandOption]> = [
	['json', jsonOption],
	['help', helpOption],
];

export function parseNumberOption(value: string, name: string) {
	const parsed = Number(value);

	if (value.trim() === '' || !Number.isFinite(parsed))
		throw new Refusal(`--${name} expects a number, got "${value}"`);

	return parsed;
}

function getUsage(command: CommandDescription, usagePrefix: string) {
	const positional = command.positional ? ` [${command.positional.name}]` : '';

	return `${usagePrefix} ${command.name}${positional} [options]`;
}

function getOptionLabel(name: string, option: CommandOption) {
	const flag = option.short ? `-${option.short}, --${name}` : `    --${name}`;

	return option.type === 'string' ? `${flag} <value>` : flag;
}

function getOptionDescription(option: CommandOption) {
	const { default: defaultValue, description } = option;

	if (defaultValue === undefined || defaultValue === false) return description;
	if (Array.isArray(defaultValue) && defaultValue.length === 0) return description;

	return `${description} (default: ${String(defaultValue)})`;
}

export function formatHelp(command: CommandDescription, usagePrefix = 'pnpm') {
	const options = [...Object.entries(command.options ?? {}), ...builtInOptions];
	const rows: Array<[string, string]> = options.map(([name, option]) => [
		getOptionLabel(name, option),
		getOptionDescription(option),
	]);

	if (command.positional) {
		rows.unshift([command.positional.name, command.positional.description]);
	}

	const width = Math.max(...rows.map(([label]) => label.length)) + 2;

	return [
		chalk.magenta(command.title),
		command.summary,
		'',
		`Usage: ${getUsage(command, usagePrefix)}`,
		'',
		...rows.map(([label, description]) => `  ${label.padEnd(width)}${chalk.gray(description)}`),
	].join('\n');
}

function isParseError(error: unknown): error is Error {
	return (
		error instanceof Error &&
		'code' in error &&
		typeof error.code === 'string' &&
		error.code.startsWith('ERR_PARSE_ARGS_')
	);
}

// Matched by shape, which covers zx's `ProcessOutput` and execa's `ExecaError` alike
function isChildProcessFailure(error: unknown): error is ChildProcessFailure {
	return error instanceof Error && 'exitCode' in error && 'signal' in error;
}

function isInterruption(error: unknown, isAborted: boolean) {
	if (isAborted) return true;

	return (
		isChildProcessFailure(error) &&
		(error.exitCode === interruptedExitCode || error.signal === 'SIGINT')
	);
}

function describeError(error: unknown): Pick<FailureReport, 'detail' | 'message'> {
	if (isParseError(error)) return { detail: 'See --help', message: error.message };

	if (isRefusal(error)) return { message: error.message };

	if (isChildProcessFailure(error)) {
		const reason = error.signal
			? `was killed by ${error.signal}`
			: `exited with code ${String(error.exitCode)}`;

		return { message: `Child process ${reason}` };
	}

	if (!(error instanceof Error)) return { message: String(error) };

	const stack = error.stack?.split('\n').slice(1).join('\n');

	return stack ? { detail: stack, message: error.message } : { message: error.message };
}

export function getFailureReport(
	error: unknown,
	{ interrupted, isAborted }: { interrupted?: string | undefined; isAborted: boolean },
): FailureReport {
	if (isInterruption(error, isAborted)) {
		return {
			exitCode: interruptedExitCode,
			isInterrupted: true,
			message: interrupted ? `Interrupted; ${interrupted}` : 'Interrupted',
		};
	}

	return { exitCode: 1, isInterrupted: false, ...describeError(error) };
}

function parseCommandArgs(command: CommandDescription) {
	const options = [...Object.entries(command.options ?? {}), ...builtInOptions];

	return parseArgs({
		allowPositionals: command.positional !== undefined,
		args: process.argv.slice(2),
		options: Object.fromEntries(
			options.map(([name, { description: _description, ...descriptor }]) => [name, descriptor]),
		),
		strict: true,
	});
}

function selectOutput(isJson: boolean) {
	if (isJson) {
		// Nested commands inherit this and join one stream
		process.env.SCRIPTS_OUTPUT = 'json';
		return;
	}

	const requested = process.env.SCRIPTS_OUTPUT;

	if (requested && !isOutputMode(requested)) {
		throw new Refusal(`SCRIPTS_OUTPUT must be pretty, plain or json, got "${requested}"`);
	}
}

export function createCommandRunner<Context extends object = object>(
	runnerOptions: CommandRunnerOptions<Context> = {},
) {
	const { context: createContext, usagePrefix = 'pnpm' } = runnerOptions;

	function defineCommand<const Options extends CommandOptions>(command: Command<Options, Context>) {
		return command;
	}

	async function runCommand<const Options extends CommandOptions>(
		command: Command<Options, Context>,
	) {
		const controller = new AbortController();
		const startTime = Date.now();
		let interruptTime: number | undefined;
		// Read before parsing, so a parse error in a `--json` run still reports as JSON
		const isJson = process.argv.slice(2).includes('--json');

		configureOutput(isJson ? 'json' : undefined, command.name);

		// One Ctrl-C arrives as a burst: the terminal's SIGINT, pnpm's forwarded copy, and a SIGTERM per nested pnpm
		function onInterrupt() {
			if (interruptTime === undefined) {
				interruptTime = Date.now();
				controller.abort();
				log.warn('Stopping; press Ctrl-C again to force quit');
				return;
			}

			if (Date.now() - interruptTime < interruptBurstMs) return;

			emit({
				durationMs: Date.now() - startTime,
				exitCode: interruptedExitCode,
				forced: true,
				message: 'Force quit',
				status: 'interrupted',
				type: 'end',
			});
			// eslint-disable-next-line unicorn/no-process-exit -- a second Ctrl-C must quit even while the command still holds the event loop
			process.exit(interruptedExitCode);
		}

		process.on('SIGINT', onInterrupt);
		process.on('SIGTERM', onInterrupt);

		try {
			const { positionals, values } = parseCommandArgs(command);

			if (values.help) {
				process.stdout.write(`${formatHelp(command, usagePrefix)}\n`);
				return;
			}

			selectOutput(isJson);
			emit({ title: command.title, type: 'start' });

			const rootPath = findWorkspaceRoot();
			// `Context` is only left at its empty default when no factory is given
			const context = createContext ? await createContext({ rootPath }) : ({} as Context);

			await command.run({
				...context,
				positionals,
				rootPath,
				signal: controller.signal,
				values: values as ParsedValues<Options>,
			});

			// A command that honours the signal by returning early was still interrupted
			controller.signal.throwIfAborted();

			emit({ durationMs: Date.now() - startTime, exitCode: 0, status: 'ok', type: 'end' });
		} catch (error) {
			const report = getFailureReport(error, {
				interrupted: command.interrupted,
				isAborted: controller.signal.aborted,
			});

			emit({
				...(report.detail === undefined ? {} : { detail: report.detail }),
				durationMs: Date.now() - startTime,
				exitCode: report.exitCode,
				message: report.message,
				status: report.isInterrupted ? 'interrupted' : 'failed',
				type: 'end',
			});

			process.exitCode = report.exitCode;
		} finally {
			process.off('SIGINT', onInterrupt);
			process.off('SIGTERM', onInterrupt);
		}
	}

	return { defineCommand, runCommand };
}
