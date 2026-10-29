import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';

import type { OutputEvent } from '../src/output/events.js';

import { readChild, runChild } from '../src/child.js';
import { getFailureReport } from '../src/command.js';
import { captureOutput, configureOutput } from '../src/output/output.js';

type ChildOutputEvent = Extract<OutputEvent, { type: 'output' }>;

const fixturePath = fileURLToPath(new URL('fixtures/run-child.ts', import.meta.url));
const nestedCommandPath = fileURLToPath(new URL('fixtures/nested-command.ts', import.meta.url));
const originalOutput = process.env.XSYNAPTIC_SCRIPTS_OUTPUT;

function node(script: string): [string, ...Array<string>] {
	return [process.execPath, '-e', script];
}

function outputs(events: Array<OutputEvent>, stream?: ChildOutputEvent['stream']) {
	return events.filter(
		(event): event is ChildOutputEvent =>
			event.type === 'output' && (stream === undefined || event.stream === stream),
	);
}

function statuses(events: Array<OutputEvent>) {
	type StatusEvent = Extract<OutputEvent, { type: 'status' }>;

	return events.filter((event): event is StatusEvent => event.type === 'status');
}

async function captureFailure(task: () => Promise<void>) {
	let failure: unknown;
	const { events } = await captureOutput(async () => {
		try {
			await task();
		} catch (error) {
			failure = error;
		}
	});

	return { error: failure, events };
}

afterEach(() => {
	if (originalOutput === undefined) {
		delete process.env.XSYNAPTIC_SCRIPTS_OUTPUT;
	} else {
		process.env.XSYNAPTIC_SCRIPTS_OUTPUT = originalOutput;
	}

	configureOutput();
});

describe('runChild in json mode', () => {
	test('streams each line as an output event tied to its step', async () => {
		configureOutput('json');

		const argv = node(
			String.raw`process.stdout.write("one\ntw"); setTimeout(() => { process.stdout.write("o\r\ntail"); console.error("warned"); }, 20)`,
		);
		const { events } = await captureOutput(() => runChild('Echoing', argv));
		const [start, end] = statuses(events);

		expect(start).toMatchObject({ argv, state: 'start', text: 'Echoing' });
		expect(outputs(events, 'stdout').map((event) => event.text)).toEqual(['one', 'two', 'tail']);
		expect(outputs(events, 'stderr').map((event) => event.text)).toEqual(['warned']);
		expect(new Set(outputs(events).map((event) => event.id))).toEqual(new Set([start?.id]));
		expect(end).toMatchObject({ id: start?.id, state: 'succeed' });
	});

	test("passes a nested command's stdout events through under its parent step, and wraps anything else", async () => {
		configureOutput('json', 'deploy-site');

		const event =
			'{"type":"status","command":"validate-content","time":"t","id":1,"state":"start"}';
		const { events } = await captureOutput(() =>
			runChild(
				'Validating',
				node(
					`console.log(${JSON.stringify(event)}); console.log('{"type":"bogus","command":"x","time":"t"}'); console.error(${JSON.stringify(event)})`,
				),
			),
		);

		const [start] = statuses(events);

		expect(events.filter((item) => item.type === 'nested')).toEqual([
			{
				line: JSON.stringify({
					...(JSON.parse(event) as object),
					parent: { command: 'deploy-site', id: start?.id },
				}),
				type: 'nested',
			},
		]);
		expect(outputs(events).map((item) => item.text)).toEqual(
			expect.arrayContaining(['{"type":"bogus","command":"x","time":"t"}', event]),
		);
	});
});

describe('runChild running a nested command', () => {
	const argv: [string, ...Array<string>] = [
		process.execPath,
		'--import',
		'jiti/register',
		nestedCommandPath,
	];

	test('relays its data as a typed event under json', async () => {
		process.env.XSYNAPTIC_SCRIPTS_OUTPUT = 'json';
		configureOutput('json');

		const { events } = await captureOutput(() => runChild('Generating placeholders', argv));
		const nested = events.flatMap((event) =>
			event.type === 'nested' ? [JSON.parse(event.line) as Record<string, unknown>] : [],
		);

		expect(outputs(events)).toEqual([]);
		expect(nested.map((event) => event.type)).toEqual(['start', 'data', 'end']);
		expect(nested[1]).toMatchObject({ command: 'lqip', value: { generated: 2 } });
	});

	test("prints neither its title nor its footer under the parent's step", async () => {
		configureOutput('plain');

		const { events } = await captureOutput(() =>
			runChild('Generating placeholders', argv, { onLine: () => true }),
		);

		expect(outputs(events).map((event) => event.text)).toEqual(['{', '  "generated": 2', '}']);
	});
});

describe('runChild with onLine', () => {
	test('judges the line without colour, keeps its colour, and drops cursor movement', async () => {
		configureOutput('pretty');

		const seen: Array<string> = [];
		const { events } = await captureOutput(() =>
			runChild(
				'Deploying worker',
				node(
					String.raw`console.log("\u001B[2K\u001B[32m+ /a.js\u001B[39m"); console.log("\u001B[1A\u001B[2K\u001B[32mUploaded\u001B[39m")`,
				),
				{
					onLine: (line) => {
						seen.push(line);
						return !line.startsWith('+ /');
					},
				},
			),
		);

		expect(seen).toEqual(['+ /a.js', 'Uploaded']);
		expect(outputs(events).map((event) => event.text)).toEqual(['\u{1B}[32mUploaded\u{1B}[39m']);
	});
});

describe('runChild relaying a nested step', () => {
	test('keeps a parent a deeper command already stamped', async () => {
		configureOutput('json', 'deploy-site');

		const event =
			'{"type":"status","command":"lqip","time":"t","id":1,"state":"start","parent":{"command":"build","id":4}}';
		const { events } = await captureOutput(() =>
			runChild('Building', node(`console.log(${JSON.stringify(event)})`)),
		);

		expect(events.filter((item) => item.type === 'nested')).toEqual([
			{ line: event, type: 'nested' },
		]);
	});
});

describe('runChild with onLine and describe', () => {
	test('parses every line, shows only the ones it keeps, and closes with the parsed summary', async () => {
		configureOutput('json');

		const changed: Array<string> = [];
		const { events } = await captureOutput(() =>
			runChild(
				'Uploading',
				node(
					String.raw`console.log(">f+++++++++ a.webp\n>f.st...... b.webp\nTotal bytes sent: 10")`,
				),
				{
					describe: () => `Uploaded · ${String(changed.length)} changed`,
					onLine: (line) => {
						if (!line.startsWith('>f')) return true;

						changed.push(line.slice(12));
						return false;
					},
				},
			),
		);

		expect(changed).toEqual(['a.webp', 'b.webp']);
		expect(outputs(events).map((event) => event.text)).toEqual(['Total bytes sent: 10']);
		expect(statuses(events).at(-1)).toMatchObject({
			durationMs: expect.any(Number),
			state: 'succeed',
			text: 'Uploaded · 2 changed',
		});
	});

	test('feeds input to the child and merges env over the parent environment', async () => {
		configureOutput('json');

		const { events } = await captureOutput(() =>
			runChild(
				'Writing secrets',
				node(
					'process.stdin.on("data", (chunk) => console.log(`${process.env.TARGET}:${String(chunk)}:${typeof process.env.PATH}`))',
				),
				{ env: { TARGET: 'vps' }, input: 'token', onLine: () => true },
			),
		);

		expect(outputs(events).map((event) => event.text)).toEqual(['vps:token:string']);
	});
});

describe('runChild with capture', () => {
	test('resolves to stdout and closes with it, still showing every line', async () => {
		configureOutput('json');

		const { events, result } = await captureOutput(() =>
			runChild(
				'Uploading',
				node(String.raw`console.log("a.webp\nb.webp"); console.error("note")`),
				{
					capture: true,
					describe: (stdout) => `Uploaded · ${String(stdout.split('\n').length)} files`,
				},
			),
		);

		expect(result).toBe('a.webp\nb.webp');
		expect(outputs(events).map((event) => event.text)).toEqual(
			expect.arrayContaining(['a.webp', 'b.webp', 'note']),
		);
		expect(statuses(events).at(-1)).toMatchObject({
			state: 'succeed',
			text: 'Uploaded · 2 files',
		});
	});

	test('captures stdout in plain output too, where the child would otherwise inherit our stderr', async () => {
		configureOutput('plain');

		const { result } = await captureOutput(() =>
			runChild('Listing', node(String.raw`console.log("\u001B[32mkept\u001B[39m")`), {
				capture: true,
			}),
		);

		expect(result).toBe('kept');
	});
});

describe('readChild', () => {
	test('returns what the child wrote, emitting nothing', async () => {
		configureOutput('json');

		const { events, result } = await captureOutput(() =>
			readChild(node('console.log("main"); console.error("noise")')),
		);

		expect(result).toEqual({ exitCode: 0, stderr: 'noise\n', stdout: 'main\n' });
		expect(events).toEqual([]);
	});

	test('feeds input and env', async () => {
		const result = await readChild(
			node(
				'process.stdin.on("data", (chunk) => process.stdout.write(`${process.env.TARGET}:${String(chunk)}`))',
			),
			{ env: { TARGET: 'vps' }, input: 'token' },
		);

		expect(result.stdout).toBe('vps:token');
	});

	test('reports the stdout of a child that failed with an empty stderr', async () => {
		const { error } = await captureFailure(async () => {
			await readChild(node('console.log("Authentication error [code: 10000]"); process.exit(1)'));
		});

		expect(getFailureReport(error, { isAborted: false })).toEqual({
			detail: 'Authentication error [code: 10000]',
			exitCode: 1,
			isInterrupted: false,
			message: expect.stringMatching(/exited with code 1$/),
		});
	});

	test('returns a failed exit code instead of throwing when allowed', async () => {
		const result = await readChild(node('process.exit(4)'), { allowFailure: true });

		expect(result.exitCode).toBe(4);
	});

	test('stops the child on abort', async () => {
		const controller = new AbortController();
		const pending = readChild(node('setInterval(() => {}, 1000)'), { signal: controller.signal });

		controller.abort();

		await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
	});
});

describe('runChild failures', () => {
	test('fails its step and reports the exit code with nothing repeated', async () => {
		configureOutput('json');

		const { error, events } = await captureFailure(() =>
			runChild('Building', node('console.error("boom"); process.exit(3)')),
		);

		expect(error).toMatchObject({
			exitCode: 3,
			message: expect.stringMatching(/exited with code 3$/),
		});
		expect(getFailureReport(error, { isAborted: false })).toEqual({
			exitCode: 1,
			isInterrupted: false,
			message: expect.stringMatching(
				/^\S+ -e console\.error\("boom"\); process\.exit\(3\) exited with code 3$/,
			),
		});
		expect(statuses(events).at(-1)).toMatchObject({ state: 'fail' });
	});

	test("forwards an abort as SIGTERM and settles only after the child's cleanup lines", async () => {
		configureOutput('json');

		const controller = new AbortController();
		const { error, events } = await captureFailure(() =>
			runChild(
				'Rendering',
				node(
					'process.on("SIGTERM", () => setTimeout(() => { console.log("saved"); process.exit(130); }, 50)); console.log("ready"); setInterval(() => {}, 1000)',
				),
				{
					onLine: (line) => {
						if (line === 'ready') controller.abort();
						return true;
					},
					signal: controller.signal,
				},
			),
		);

		expect(outputs(events).map((event) => event.text)).toEqual(['ready', 'saved']);
		expect(getFailureReport(error, { isAborted: true }).isInterrupted).toBe(true);
	});

	test('fails its step when the executable is missing', async () => {
		configureOutput('json');

		const { error, events } = await captureFailure(() =>
			runChild('Building', ['astro-scripts-missing-executable']),
		);

		expect(error).toMatchObject({ code: 'ENOENT' });
		expect(statuses(events).at(-1)).toMatchObject({ state: 'fail' });
	});
});

describe('runChild without onLine', () => {
	test('hands the child our stderr for both streams, keeping stdout for data', () => {
		const result = spawnSync(process.execPath, ['--import', 'jiti/register', fixturePath], {
			encoding: 'utf8',
			env: { ...process.env, XSYNAPTIC_SCRIPTS_OUTPUT: undefined },
		});

		expect(result.stdout).toBe('');
		expect(result.stderr.split('\n')).toEqual([
			'Echoing',
			'child stdout',
			'child stderr',
			expect.stringMatching(/^✓ Echoing · \d+(ms|\.\ds)$/),
			'',
		]);
	});
});
