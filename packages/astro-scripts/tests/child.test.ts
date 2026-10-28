import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';

import type { OutputEvent } from '../src/output/events.js';

import { runChild } from '../src/child.js';
import { getFailureReport } from '../src/command.js';
import { captureOutput, configureOutput } from '../src/output/output.js';

type ChildOutputEvent = Extract<OutputEvent, { type: 'output' }>;
type StatusEvent = Extract<OutputEvent, { type: 'status' }>;

const fixturePath = fileURLToPath(new URL('fixtures/run-child.ts', import.meta.url));

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

	test("passes a nested command's events through, but wraps its data and anything event-like", async () => {
		configureOutput('json');

		const event =
			'{"type":"status","command":"validate-content","time":"t","id":1,"state":"start"}';
		const { events } = await captureOutput(() =>
			runChild(
				'Validating',
				node(
					`console.error(${JSON.stringify(event)}); console.error('{"type":"bogus","command":"x","time":"t"}'); console.log('{"name":"entry-ids","status":"pass"}')`,
				),
			),
		);

		expect(events.filter((item) => item.type === 'nested')).toEqual([
			{ line: event, type: 'nested' },
		]);
		expect(outputs(events).map((item) => item.text)).toEqual(
			expect.arrayContaining([
				'{"type":"bogus","command":"x","time":"t"}',
				'{"name":"entry-ids","status":"pass"}',
			]),
		);
	});
});

describe('runChild with a filter', () => {
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
					filter: (line) => {
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
			message: 'Child process exited with code 3',
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
					filter: (line) => {
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

describe('runChild without a filter', () => {
	test('hands the child our stderr for both streams, keeping stdout for data', () => {
		const result = spawnSync(process.execPath, ['--import', 'jiti/register', fixturePath], {
			encoding: 'utf8',
			env: { ...process.env, SCRIPTS_OUTPUT: 'plain' },
		});

		expect(result.stdout).toBe('');
		expect(result.stderr.split('\n')).toEqual([
			'Echoing',
			'child stdout',
			'child stderr',
			expect.stringMatching(/^✓ Echoing · \d+\.\ds$/),
			'',
		]);
	});
});
