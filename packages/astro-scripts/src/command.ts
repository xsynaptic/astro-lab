import type { ParseArgsOptionDescriptor } from 'node:util';

import chalk from 'chalk';
import { parseArgs } from 'node:util';

import type { StepOutcome } from './output/output.js';

import { configureOutput, emit, getOutputMode, log, trackStepOutcomes } from './output/output.js';
import { isUserError, UserError } from './user-error.js';
import { findWorkspaceRoot } from './workspace.js';

type CommandOption = ParseArgsOptionDescriptor & { description: string };

type CommandOptions = Record<string, CommandOption>;

interface CommandPositional {
	choices?: ReadonlyArray<string>;
	description: string;
	name: string;
	required?: boolean;
}

type PositionalValue<Positional> = Positional extends {
	choices: ReadonlyArray<infer Choice extends string>;
}
	? Choice
	: string;

type Positionals<Positional> = [Positional] extends [{ required: true }]
	? [PositionalValue<Positional>, ...Array<PositionalValue<Positional>>]
	: Array<PositionalValue<Positional>>;

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

export interface CommandContext<Options extends CommandOptions, Positional = CommandPositional> {
	positionals: Positionals<Positional>;
	rootPath: string;
	signal: AbortSignal;
	values: ParsedValues<Options>;
}

export interface Command<
	Options extends CommandOptions,
	Context,
	Positional extends CommandPositional = CommandPositional,
> extends CommandDescription {
	interrupted?: string;
	options?: Options;
	positional?: Positional;
	run: (context: CommandContext<Options, Positional> & Context) => Promise<void> | void;
}

interface CommandRunnerOptions<Context> {
	context?: (base: { rootPath: string }) => Context | Promise<Context>;
	usagePrefix?: string;
}

interface ChildProcessFailure extends Error {
	exitCode: null | number | undefined;
	signal: null | string | undefined;
	stderr?: unknown;
	stdout?: unknown;
}

interface FailureReport {
	detail?: string;
	exitCode: number;
	isInterrupted: boolean;
	message: string;
}

const interruptedExitCode = 130;
const helpWidth = 100;
const interruptBurstMs = 1000;
const outputTailLines = 20;

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

export interface CommandScope {
	onEnd: Array<() => Promise<void>>;
	signal: AbortSignal;
}

let activeScope: CommandScope | undefined;

export function getCommandScope() {
	return activeScope;
}

export function getCommandSignal() {
	return activeScope?.signal;
}

export function parseNumberOption(value: string, name: string) {
	const parsed = Number(value);

	if (value.trim() === '' || !Number.isFinite(parsed))
		throw new UserError(`--${name} expects a number, got "${value}"`);

	return parsed;
}

function getArgs() {
	const args = process.argv.slice(2);

	return args[0] === '--' ? args.slice(1) : args;
}

function getOutputTail({ stderr, stdout }: { stderr?: unknown; stdout?: unknown }) {
	for (const output of [stderr, stdout]) {
		const text = typeof output === 'string' ? output.trimEnd() : '';

		if (text !== '') return text.split('\n').slice(-outputTailLines).join('\n');
	}

	return;
}

function getStepOutcomeFields(outcomes: ReadonlyArray<StepOutcome>) {
	const warned = outcomes.filter(({ state }) => state === 'warn').map(({ text }) => text);
	const skipped = outcomes.filter(({ state }) => state === 'skip').map(({ text }) => text);

	return {
		...(skipped.length > 0 ? { skipped } : {}),
		...(warned.length > 0 ? { warned } : {}),
	};
}

function getUsage(command: CommandDescription, usagePrefix: string) {
	const { name, positional } = command;

	if (!positional) return `${usagePrefix} ${name} [options]`;

	const label = positional.required ? `<${positional.name}>` : `[${positional.name}]`;

	return `${usagePrefix} ${name} ${label} [options]`;
}

function getOptionLabel(name: string, option: CommandOption) {
	const flag = option.short ? `-${option.short}, --${name}` : `    --${name}`;

	return option.type === 'string' ? `${flag} <value>` : flag;
}

function wrapList(items: ReadonlyArray<string>, width: number) {
	const lines: Array<string> = [];
	let line = '';

	for (const item of items) {
		const next = line === '' ? item : `${line}, ${item}`;

		if (line !== '' && next.length > width) {
			lines.push(`${line},`);
			line = item;
			continue;
		}

		line = next;
	}

	if (line !== '') lines.push(line);

	return lines;
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

	const { positional } = command;

	if (positional) rows.unshift([positional.name, positional.description]);

	const width = Math.max(...rows.map(([label]) => label.length)) + 2;
	const choiceRows = wrapList(positional?.choices ?? [], helpWidth - width - 2).map(
		(line): [string, string] => ['', line],
	);

	rows.splice(1, 0, ...choiceRows);

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

	if (isUserError(error)) {
		const { detail, message } = error;

		return typeof detail === 'string' && detail !== '' ? { detail, message } : { message };
	}

	if (isChildProcessFailure(error)) {
		const reason = error.signal
			? `was killed by ${error.signal}`
			: `exited with code ${String(error.exitCode)}`;
		const message = error.name === 'ChildProcessError' ? error.message : `Child process ${reason}`;
		const detail = getOutputTail(error);

		return detail === undefined ? { message } : { detail, message };
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
	const parsed = parseArgs({
		allowPositionals: command.positional !== undefined,
		args: getArgs(),
		options: Object.fromEntries(
			options.map(([name, { description: _description, ...descriptor }]) => [name, descriptor]),
		),
		strict: true,
	});

	const { positional } = command;

	if (!positional || parsed.values.help) return parsed;

	if (positional.required && parsed.positionals.length === 0) {
		throw new UserError(`Missing <${positional.name}>`, { detail: 'See --help' });
	}

	const { choices } = positional;

	if (!choices) return parsed;

	const unknown = parsed.positionals.find((value) => !choices.includes(value));

	if (unknown !== undefined) {
		throw new UserError(`Unknown ${positional.name} "${unknown}"`, {
			detail: `Expected one of: ${choices.join(', ')}`,
		});
	}

	return parsed;
}

export function createCommandRunner<Context extends object = object>(
	runnerOptions: CommandRunnerOptions<Context> = {},
) {
	const { context: createContext, usagePrefix = 'pnpm' } = runnerOptions;

	function defineCommand<
		const Options extends CommandOptions,
		const Positional extends CommandPositional = CommandPositional,
	>(command: Command<Options, Context, Positional>) {
		return command;
	}

	async function runCommand<
		const Options extends CommandOptions,
		const Positional extends CommandPositional = CommandPositional,
	>(command: Command<Options, Context, Positional>) {
		const controller = new AbortController();
		const startTime = Date.now();
		let interruptTime: number | undefined;
		// Read before parsing, so a parse error in a `--json` run still reports as JSON
		const args = getArgs();
		const separator = args.indexOf('--');
		const isJson = (separator === -1 ? args : args.slice(0, separator)).includes('--json');

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

		const previousScope = activeScope;
		const scope: CommandScope = { onEnd: [], signal: controller.signal };
		const stepOutcomes = trackStepOutcomes();
		let hasStarted = false;

		activeScope = scope;

		try {
			const { positionals, values } = parseCommandArgs(command);

			if (values.help) {
				process.stdout.write(`${formatHelp(command, usagePrefix)}\n`);
				return;
			}

			// Nested commands inherit this and join one stream
			if (isJson) process.env.XSYNAPTIC_SCRIPTS_OUTPUT = 'json';

			emit({ title: command.title, type: 'start' });
			hasStarted = true;

			const rootPath = findWorkspaceRoot();
			// `Context` is only left at its empty default when no factory is given
			const context = createContext ? await createContext({ rootPath }) : ({} as Context);

			try {
				await command.run({
					...context,
					positionals: positionals as Positionals<Positional>,
					rootPath,
					signal: controller.signal,
					values: values as ParsedValues<Options>,
				});
			} finally {
				await Promise.all(scope.onEnd.map((close) => close()));
			}

			// A command that honours the signal by returning early was still interrupted
			controller.signal.throwIfAborted();

			emit({
				...getStepOutcomeFields(stepOutcomes.outcomes),
				durationMs: Date.now() - startTime,
				exitCode: 0,
				status: 'ok',
				type: 'end',
			});
		} catch (error) {
			if (!hasStarted && getOutputMode() === 'json') emit({ title: command.title, type: 'start' });

			const report = getFailureReport(error, {
				interrupted: command.interrupted,
				isAborted: controller.signal.aborted,
			});

			emit({
				...getStepOutcomeFields(stepOutcomes.outcomes),
				...(report.detail === undefined ? {} : { detail: report.detail }),
				durationMs: Date.now() - startTime,
				exitCode: report.exitCode,
				message: report.message,
				status: report.isInterrupted ? 'interrupted' : 'failed',
				type: 'end',
			});

			process.exitCode = report.exitCode;
		} finally {
			stepOutcomes.restore();
			activeScope = previousScope;
			process.off('SIGINT', onInterrupt);
			process.off('SIGTERM', onInterrupt);
		}
	}

	return { defineCommand, runCommand };
}
