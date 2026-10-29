import { Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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

function createTerminalHarness({ isStdoutTerminal }: { isStdoutTerminal: boolean }) {
	const transcript: Array<string> = [];

	function createStream(name: string, isTerminal: boolean) {
		const stream = new Writable({
			write(chunk: Buffer, _encoding, callback) {
				const text = stripVTControlCharacters(chunk.toString()).trim();

				if (text !== '') transcript.push(`${name}: ${text}`);
				callback();
			},
		});

		if (!isTerminal) return stream;

		return Object.assign(stream, {
			clearLine: () => {
				transcript.push(`${name}: clear`);
				return true;
			},
			columns: 100,
			cursorTo: () => true,
			isTTY: true,
			moveCursor: () => true,
		});
	}

	const reporter = createPrettyReporter({
		stderr: createStream('stderr', true),
		stdout: createStream('stdout', isStdoutTerminal),
	});

	return {
		emit: (...events: Array<OutputEvent>) => {
			for (const event of events) reporter.emit(event);
		},
		transcript,
	};
}

function spinnerFrame(text: string) {
	return expect.stringMatching(new RegExp(String.raw`^stderr: \S ${text}$`)) as string;
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

	test('resumes the outer status when a nested one closes, so a later failure marks it', () => {
		const harness = createHarness(createPrettyReporter);

		harness.emit(
			{ id: 1, state: 'start', text: 'Deploying', type: 'status' },
			{ id: 2, state: 'start', text: 'Uploading', type: 'status' },
			{ id: 2, state: 'succeed', text: 'Uploaded', type: 'status' },
			{ durationMs: 1, exitCode: 1, message: 'Purge failed', status: 'failed', type: 'end' },
		);

		expect(harness.stderr().slice(-3)).toEqual(['✓ Uploaded', '✗ Deploying', '✗ Purge failed']);
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

	test('writes formatted data to stdout as the formatter painted it', () => {
		const harness = createHarness(createPrettyReporter);

		harness.emit({
			render: () => '\u{1B}[31mMissing 2\u{1B}[39m',
			type: 'data',
			value: { missing: 2 },
		});

		expect(harness.stdout()).toEqual(['\u{1B}[31mMissing 2\u{1B}[39m']);
	});

	test('indents every line of a multi-line failure detail', () => {
		const harness = createHarness(createPrettyReporter);

		harness.emit({
			detail: 'rsync: connection unexpectedly closed\nrsync error: code 12',
			durationMs: 1,
			exitCode: 1,
			message: 'Child process exited with code 12',
			status: 'failed',
			type: 'end',
		});

		expect(harness.stderr()).toEqual([
			'✗ Child process exited with code 12',
			'  rsync: connection unexpectedly closed',
			'  rsync error: code 12',
		]);
	});
});

describe('pretty reporter on a terminal', () => {
	beforeEach(() => {
		vi.stubEnv('CI', undefined);
		vi.stubEnv('TERM', 'xterm-256color');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test('clears the spinner around data when stdout shares the terminal', () => {
		const harness = createTerminalHarness({ isStdoutTerminal: true });

		harness.emit(
			{ id: 1, state: 'start', text: 'Scanning', type: 'status' },
			{ type: 'data', value: 'orphan.jpg' },
		);

		const written = harness.transcript.indexOf('stdout: orphan.jpg');

		expect(harness.transcript.slice(written - 1, written + 2)).toEqual([
			'stderr: clear',
			'stdout: orphan.jpg',
			spinnerFrame('Scanning'),
		]);

		harness.emit({ durationMs: 1, exitCode: 0, status: 'ok', type: 'end' });
	});

	test('leaves the spinner alone when stdout is piped', () => {
		const harness = createTerminalHarness({ isStdoutTerminal: false });

		harness.emit(
			{ id: 1, state: 'start', text: 'Scanning', type: 'status' },
			{ type: 'data', value: 'orphan.jpg' },
		);

		expect(harness.transcript).toEqual([spinnerFrame('Scanning'), 'stdout: orphan.jpg']);

		harness.emit({ durationMs: 1, exitCode: 0, status: 'ok', type: 'end' });
	});

	test('hands the terminal to a child step, then resumes the outer spinner', () => {
		const harness = createTerminalHarness({ isStdoutTerminal: false });

		harness.emit(
			{ id: 1, state: 'start', text: 'Deploying', type: 'status' },
			{
				argv: ['pnpm', 'astro', 'build'],
				id: 2,
				state: 'start',
				step: true,
				text: 'Building',
				type: 'status',
			},
			{ id: 2, stream: 'stdout', text: 'built 3 pages', type: 'output' },
			{ durationMs: 3000, id: 2, state: 'succeed', text: 'Building', type: 'status' },
		);

		const step = harness.transcript.indexOf('stderr: Building');

		expect(harness.transcript.slice(step, step + 4)).toEqual([
			'stderr: Building',
			'stderr: built 3 pages',
			'stderr: ✓ Building · 3.0s',
			spinnerFrame('Deploying'),
		]);

		harness.emit({ durationMs: 1, exitCode: 0, status: 'ok', type: 'end' });
	});

	test('heads an in-process step over its inner spinner and closes it after', () => {
		const harness = createTerminalHarness({ isStdoutTerminal: false });

		harness.emit(
			{ id: 1, state: 'start', step: true, text: 'Sitemap lastmod', type: 'status' },
			{ id: 2, state: 'start', text: 'Reading git', type: 'status' },
			{ id: 2, state: 'succeed', text: 'Read 40 dates', type: 'status' },
			{ durationMs: 1200, id: 1, state: 'succeed', text: 'Sitemap lastmod', type: 'status' },
		);

		expect(harness.transcript.filter((line) => !line.endsWith('clear'))).toEqual([
			'stderr: Sitemap lastmod',
			spinnerFrame('Reading git'),
			'stderr: ✓ Read 40 dates',
			'stderr: ✓ Sitemap lastmod · 1.2s',
		]);
	});

	test('marks a child step failed when the run ends inside it', () => {
		const harness = createTerminalHarness({ isStdoutTerminal: false });

		harness.emit(
			{
				argv: ['pnpm', 'astro', 'build'],
				id: 1,
				state: 'start',
				step: true,
				text: 'Building',
				type: 'status',
			},
			{
				durationMs: 1,
				exitCode: 130,
				forced: true,
				message: 'Force quit',
				status: 'interrupted',
				type: 'end',
			},
		);

		expect(harness.transcript).toEqual([
			'stderr: Building',
			'stderr: ✗ Building',
			'stderr: ✗ Force quit',
		]);
	});
});

describe('plain reporter', () => {
	test('prints child lines bare, without their colour', () => {
		const harness = createHarness(createPlainReporter);

		harness.emit(
			{
				argv: ['pnpm', 'astro', 'build'],
				id: 1,
				state: 'start',
				step: true,
				text: 'Building',
				type: 'status',
			},
			{ id: 1, stream: 'stdout', text: '\u{1B}[32mbuilt\u{1B}[39m', type: 'output' },
			{ durationMs: 3000, id: 1, state: 'succeed', text: 'Building', type: 'status' },
		);

		expect(harness.stderr()).toEqual(['Building', 'built', '✓ Building · 3.0s']);
	});

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

	test('prints progress every ten seconds between tenths', () => {
		const clock = createClock();
		const harness = createHarness((streams) => createPlainReporter(streams, { now: clock.now }));

		harness.emit({ id: 1, state: 'start', text: 'Rendering 0 / 100 (0%)', type: 'status' });

		for (const done of [1, 2, 3, 4]) {
			clock.advance(4000);
			harness.emit(progress(done, 0.25));
		}

		expect(harness.stderr()).toEqual([
			'Rendering 0 / 100 (0%)',
			'Rendering 3 / 100 (3%) · 0.3/s · ~6m 28s left',
		]);
	});

	test('prints progress as soon as it reaches a new tenth', () => {
		const clock = createClock();
		const harness = createHarness((streams) => createPlainReporter(streams, { now: clock.now }));

		harness.emit({ id: 1, state: 'start', text: 'Rendering 0 / 100 (0%)', type: 'status' });

		for (const done of [5, 10, 15, 20]) {
			clock.advance(100);
			harness.emit(progress(done));
		}

		expect(harness.stderr()).toEqual([
			'Rendering 0 / 100 (0%)',
			'Rendering 10 / 100 (10%)',
			'Rendering 20 / 100 (20%)',
		]);
	});

	test('writes formatted data to stdout with its colour dropped', () => {
		const harness = createHarness(createPlainReporter);

		harness.emit({
			render: () => '\u{1B}[31mMissing 2\u{1B}[39m',
			type: 'data',
			value: { missing: 2 },
		});

		expect(harness.stdout()).toEqual(['Missing 2']);
	});

	test('marks the outer status as failed once a nested one has closed', () => {
		const harness = createHarness(createPlainReporter);

		harness.emit(
			{ id: 1, state: 'start', text: 'Deploying', type: 'status' },
			{ id: 2, state: 'start', text: 'Uploading', type: 'status' },
			{ id: 2, state: 'succeed', text: 'Uploaded', type: 'status' },
			{ durationMs: 1, exitCode: 1, message: 'Purge failed', status: 'failed', type: 'end' },
		);

		expect(harness.stderr()).toEqual([
			'Deploying',
			'Uploading',
			'✓ Uploaded',
			'✗ Deploying',
			'✗ Purge failed',
		]);
	});
});

function parse(lines: Array<string>) {
	return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe.each([
	['pretty', createPrettyReporter],
	['plain', createPlainReporter],
] as const)('%s reporter with step outcomes', (_name, createReporter) => {
	test('closes a skipped step with its reason beneath, and lists warned and skipped steps before the footer', () => {
		const harness = createHarness((streams) => createReporter(streams));

		harness.emit(
			{ id: 1, state: 'start', step: true, text: 'Fetching webmentions', type: 'status' },
			{
				detail: 'WEBMENTIONS_SHOW is off',
				durationMs: 2,
				id: 1,
				state: 'skip',
				text: 'Fetching webmentions',
				type: 'status',
			},
			{
				durationMs: 1500,
				exitCode: 0,
				skipped: ['Fetching webmentions'],
				status: 'ok',
				type: 'end',
				warned: ['Pulling stats', 'Pulling listens'],
			},
		);

		expect(harness.stderr()).toEqual([
			'Fetching webmentions',
			'– Fetching webmentions · 2ms',
			'  WEBMENTIONS_SHOW is off',
			'⚠ Warned: Pulling stats, Pulling listens',
			'– Skipped: Fetching webmentions',
			'  Finished in 1.5s',
		]);
	});
});

describe.each([
	['pretty', createPrettyReporter],
	['plain', createPlainReporter],
] as const)('%s reporter under runChild', (_name, createReporter) => {
	function createNestedHarness() {
		return createHarness((streams) => createReporter(streams, { isNested: true }));
	}

	test("leaves the title and a successful run's footer to the parent's step line", () => {
		const harness = createNestedHarness();

		harness.emit(
			{ title: 'Validate content', type: 'start' },
			{ level: 'success', text: '18 checks passed', type: 'message' },
			{ durationMs: 6200, exitCode: 0, status: 'ok', type: 'end' },
		);

		expect(harness.stderr()).toEqual(['✓ 18 checks passed']);
	});

	test('still reports why a run failed', () => {
		const harness = createNestedHarness();

		harness.emit(
			{ title: 'Validate content', type: 'start' },
			{
				detail: 'See --help',
				durationMs: 1,
				exitCode: 1,
				message: 'Missing <id>',
				status: 'failed',
				type: 'end',
			},
		);

		expect(harness.stderr()).toEqual(['✗ Missing <id>', '  See --help']);
	});
});

describe('json reporter', () => {
	test('wraps child lines with their step and stream, and relays nested events verbatim', () => {
		const harness = createHarness((streams) =>
			createJsonReporter(streams, { command: 'deploy-site', now: () => 0 }),
		);
		const nested =
			'{"type":"status","command":"validate-content","time":"t","id":1,"state":"start"}';

		harness.emit(
			{
				argv: ['pnpm', 'validate-content'],
				id: 1,
				state: 'start',
				text: 'Validating',
				type: 'status',
			},
			{ id: 1, stream: 'stdout', text: '\u{1B}[33m[WARN]\u{1B}[39m slow', type: 'output' },
			{ line: nested, type: 'nested' },
		);

		expect(harness.stdout()).toEqual([
			'{"type":"status","command":"deploy-site","time":"1970-01-01T00:00:00.000Z","argv":["pnpm","validate-content"],"id":1,"state":"start","text":"Validating"}',
			'{"type":"output","command":"deploy-site","time":"1970-01-01T00:00:00.000Z","id":1,"stream":"stdout","text":"[WARN] slow"}',
			nested,
		]);
	});

	test('wraps each event with its type, command, and time, colour stripped', () => {
		const harness = createHarness((streams) =>
			createJsonReporter(streams, { command: 'render-images', now: () => 0 }),
		);

		harness.emit({ level: 'warn', text: '\u{1B}[33mslow\u{1B}[39m', type: 'message' });

		expect(harness.stdout()).toEqual([
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

		expect(parse(harness.stdout())[0]?.rows).toEqual([
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

		expect(parse(harness.stdout()).map((event) => event.done ?? event.state)).toEqual([
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

		expect(parse(harness.stdout()).map((event) => event.state)).toEqual([
			'start',
			'update',
			'stop',
		]);
	});

	test('writes data as an event without rendering its human formatting', () => {
		const harness = createHarness((streams) =>
			createJsonReporter(streams, { command: 'lqip', now: () => 0 }),
		);
		const render = vi.fn(() => 'Generated 0');

		harness.emit({ render, type: 'data', value: { generated: 0 } });

		expect(harness.stdout()).toEqual([
			'{"type":"data","command":"lqip","time":"1970-01-01T00:00:00.000Z","value":{"generated":0}}',
		]);
		expect(harness.stderr()).toEqual([]);
		expect(render).not.toHaveBeenCalled();
	});
});
