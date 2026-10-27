import { Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { describe, expect, test } from 'vitest';

import type { OutputEvent, Reporter } from '../src/output/events.js';

import { createJsonReporter } from '../src/output/reporter-json.js';
import { createPlainReporter } from '../src/output/reporter-plain.js';
import { createPrettyReporter } from '../src/output/reporter-pretty.js';

function createCollector() {
	const chunks: Array<string> = [];
	const stream = new Writable({
		write(chunk: Buffer, _encoding, callback) {
			chunks.push(chunk.toString());
			callback();
		},
	});

	return {
		lines: () => chunks.join('').split('\n').slice(0, -1),
		stream,
	};
}

function createHarness(build: (streams: { stderr: Writable; stdout: Writable }) => Reporter) {
	const stderr = createCollector();
	const stdout = createCollector();
	const reporter = build({ stderr: stderr.stream, stdout: stdout.stream });

	return {
		emit: (...events: Array<OutputEvent>) => {
			for (const event of events) reporter.emit(event);
		},
		stderr: () => stderr.lines().map((line) => stripVTControlCharacters(line)),
		stdout: stdout.lines,
	};
}

function createClock() {
	let time = 0;

	return {
		advance: (milliseconds: number) => {
			time += milliseconds;
		},
		now: () => time,
	};
}

const progress = (done: number, perSecond?: number): OutputEvent => ({
	done,
	id: 1,
	label: 'Rendering',
	total: 100,
	type: 'progress',
	...(perSecond === undefined ? {} : { perSecond }),
});

describe('pretty reporter', () => {
	test('renders each message level as spectralcodex does', () => {
		const harness = createHarness(createPrettyReporter);

		harness.emit(
			{ title: 'Images', type: 'start' },
			{ level: 'step', text: 'Reading sources', type: 'message' },
			{ level: 'info', text: 'plain words', type: 'message' },
			{ level: 'detail', text: 'a detail', type: 'message' },
			{ level: 'success', text: 'done', type: 'message' },
			{ level: 'warn', text: 'careful', type: 'message' },
			{ level: 'error', text: 'broken', type: 'message' },
			{
				rows: [
					['Renditions', 4000],
					['Mode', 'full'],
				],
				type: 'summary',
			},
			{ durationMs: 5120, exitCode: 0, status: 'ok', type: 'end' },
		);

		expect(harness.stderr()).toEqual([
			'=== Images ===',
			'Reading sources',
			'plain words',
			'  a detail',
			'✓ done',
			'⚠ careful',
			'✗ broken',
			'  Renditions: 4,000',
			'  Mode:       full',
			'  Finished in 5.1s',
		]);
	});

	test('persists a status with its symbol and final text', () => {
		const harness = createHarness(createPrettyReporter);

		harness.emit(
			{ id: 1, state: 'start', text: 'Pruning', type: 'status' },
			{ id: 1, state: 'succeed', text: 'Pruned 3 assets', type: 'status' },
		);

		expect(harness.stderr().at(-1)).toBe('✓ Pruned 3 assets');
	});

	test('marks the open status as failed before reporting a failure', () => {
		const harness = createHarness(createPrettyReporter);

		harness.emit(
			{ id: 1, state: 'start', text: 'Reloading Caddy', type: 'status' },
			{ id: 1, state: 'update', text: 'Reloading Caddy · waiting', type: 'status' },
			{
				detail: 'See --help',
				durationMs: 10,
				exitCode: 1,
				message: 'Child process exited with code 2',
				status: 'failed',
				type: 'end',
			},
		);

		expect(harness.stderr().slice(-3)).toEqual([
			'✗ Reloading Caddy · waiting',
			'✗ Child process exited with code 2',
			'  See --help',
		]);
	});

	test('still persists a status displaced by a newer one', () => {
		const harness = createHarness(createPrettyReporter);

		harness.emit(
			{ id: 1, state: 'start', text: 'Outer', type: 'status' },
			{ id: 2, state: 'start', text: 'Inner', type: 'status' },
			{ id: 2, state: 'succeed', text: 'Inner done', type: 'status' },
			{ id: 1, state: 'warn', text: 'Outer partial', type: 'status' },
		);

		expect(harness.stderr().slice(-2)).toEqual(['✓ Inner done', '⚠ Outer partial']);
	});

	test('paints an interrupt as a warning and a force quit as an error', () => {
		const harness = createHarness(createPrettyReporter);

		harness.emit(
			{ durationMs: 1, exitCode: 130, message: 'Interrupted', status: 'interrupted', type: 'end' },
			{
				durationMs: 1,
				exitCode: 130,
				forced: true,
				message: 'Force quit',
				status: 'interrupted',
				type: 'end',
			},
		);

		expect(harness.stderr()).toEqual(['⚠ Interrupted', '✗ Force quit']);
	});

	test('writes data to stdout, a string raw and anything else as indented JSON', () => {
		const harness = createHarness(createPrettyReporter);

		harness.emit({ type: 'data', value: 'orphan.jpg' }, { type: 'data', value: { count: 2 } });

		expect(harness.stdout()).toEqual(['orphan.jpg', '{', '  "count": 2', '}']);
		expect(harness.stderr()).toEqual([]);
	});
});

describe('plain reporter', () => {
	test('prints a status on start and end, not on update', () => {
		const harness = createHarness(createPlainReporter);

		harness.emit(
			{ id: 1, state: 'start', text: 'Syncing', type: 'status' },
			{ id: 1, state: 'update', text: 'Syncing · 4 changed', type: 'status' },
			{ id: 1, state: 'succeed', text: 'Synced', type: 'status' },
			{ id: 2, state: 'start', text: 'Pruning', type: 'status' },
			{ id: 2, state: 'stop', text: 'Pruning', type: 'status' },
		);

		expect(harness.stderr()).toEqual(['Syncing', '✓ Synced', 'Pruning']);
	});

	test('prints progress once every ten seconds', () => {
		const clock = createClock();
		const harness = createHarness((streams) => createPlainReporter(streams, clock.now));

		harness.emit({ id: 1, state: 'start', text: 'Rendering 0 / 100 (0%)', type: 'status' });

		for (const done of [10, 20, 30, 40]) {
			clock.advance(4000);
			harness.emit(progress(done, 2.5));
		}

		expect(harness.stderr()).toEqual([
			'Rendering 0 / 100 (0%)',
			'Rendering 30 / 100 (30%) · 2.5/s · ~28.0s left',
		]);
	});

	test('drops colour the caller painted into its text', () => {
		const harness = createHarness(createPlainReporter);

		harness.emit({ level: 'info', text: '\u{1B}[32mhealthy\u{1B}[39m', type: 'message' });

		expect(harness.stderr()).toEqual(['healthy']);
	});

	test('marks the open status as failed before reporting a failure', () => {
		const harness = createHarness(createPlainReporter);

		harness.emit(
			{ id: 1, state: 'start', text: 'Validating', type: 'status' },
			{ durationMs: 1, exitCode: 1, message: 'Invalid config', status: 'failed', type: 'end' },
		);

		expect(harness.stderr()).toEqual(['Validating', '✗ Validating', '✗ Invalid config']);
	});
});

function parse(lines: Array<string>) {
	return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('json reporter', () => {
	test('wraps each event with its type, command, and time, colour stripped', () => {
		const harness = createHarness((streams) =>
			createJsonReporter(streams, { command: 'render-images', now: () => 0 }),
		);

		harness.emit({ level: 'warn', text: '\u{1B}[33mslow\u{1B}[39m', type: 'message' });

		expect(harness.stderr()).toEqual([
			'{"type":"message","command":"render-images","time":"1970-01-01T00:00:00.000Z","level":"warn","text":"slow"}',
		]);
	});

	test('keeps summary rows as ordered pairs', () => {
		const harness = createHarness(createJsonReporter);

		harness.emit({
			rows: [
				['Renditions', 4000],
				['Rendered', 120],
			],
			type: 'summary',
		});

		expect(parse(harness.stderr())[0]?.rows).toEqual([
			['Renditions', 4000],
			['Rendered', 120],
		]);
	});

	test('throttles progress to once a second and flushes the last before the status ends', () => {
		const clock = createClock();
		const harness = createHarness((streams) => createJsonReporter(streams, { now: clock.now }));

		harness.emit({ id: 1, state: 'start', text: 'Rendering', type: 'status' }, progress(1));

		for (const done of [2, 3, 4]) {
			clock.advance(300);
			harness.emit(progress(done));
		}

		harness.emit({ id: 1, state: 'succeed', text: 'Rendered 4', type: 'status' });

		expect(parse(harness.stderr()).map((event) => event.done ?? event.state)).toEqual([
			'start',
			1,
			4,
			'succeed',
		]);
	});

	test('throttles status updates but never the start or end', () => {
		const clock = createClock();
		const harness = createHarness((streams) => createJsonReporter(streams, { now: clock.now }));

		harness.emit(
			{ id: 1, state: 'start', text: 'Syncing', type: 'status' },
			{ id: 1, state: 'update', text: 'a', type: 'status' },
			{ id: 1, state: 'update', text: 'b', type: 'status' },
			{ id: 1, state: 'stop', text: 'b', type: 'status' },
		);

		expect(parse(harness.stderr()).map((event) => event.state)).toEqual([
			'start',
			'update',
			'stop',
		]);
	});

	test('writes data as one JSON line on stdout', () => {
		const harness = createHarness(createJsonReporter);

		harness.emit({ type: 'data', value: { files: ['a.jpg'] } });

		expect(harness.stdout()).toEqual(['{"files":["a.jpg"]}']);
		expect(harness.stderr()).toEqual([]);
	});
});
