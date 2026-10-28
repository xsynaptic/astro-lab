import { afterEach, describe, expect, test, vi } from 'vitest';

import { captureOutput, configureOutput, getOutputMode, log } from '../src/output/output.js';
import { withSpinner } from '../src/output/progress.js';

describe('captureOutput', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('records what a task logged in place of writing it, whatever the output mode', async () => {
		const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

		configureOutput('json');

		const { events, result } = await captureOutput(async () => {
			log.warn('3 entries lack alt text');
			log.data({ missing: 3 }, ({ missing }) => `Missing ${String(missing)}`);

			return withSpinner('Checking', async () => {
				await Promise.resolve();

				return 3;
			});
		});

		expect(result).toBe(3);
		expect(events).toEqual([
			{ level: 'warn', text: '3 entries lack alt text', type: 'message' },
			{ render: expect.any(Function) as () => string, type: 'data', value: { missing: 3 } },
			expect.objectContaining({ state: 'start', text: 'Checking', type: 'status' }),
			expect.objectContaining({ state: 'succeed', text: 'Checking', type: 'status' }),
		]);
		expect(events[1]?.type === 'data' && events[1].render?.()).toBe('Missing 3');
		expect(write).not.toHaveBeenCalled();
	});
});

describe('output mode detection', () => {
	const originalOutput = process.env.SCRIPTS_OUTPUT;
	const { columns, isTTY } = process.stderr;

	function setTerminal(width: number) {
		Object.assign(process.stderr, { columns: width, isTTY: true });
	}

	afterEach(() => {
		Object.assign(process.stderr, { columns, isTTY });

		if (originalOutput === undefined) {
			delete process.env.SCRIPTS_OUTPUT;
		} else {
			process.env.SCRIPTS_OUTPUT = originalOutput;
		}

		configureOutput();
	});

	test('falls back to plain on a terminal that reports no width', () => {
		delete process.env.SCRIPTS_OUTPUT;

		setTerminal(0);
		configureOutput();
		expect(getOutputMode()).toBe('plain');

		setTerminal(120);
		configureOutput();
		expect(getOutputMode()).toBe('pretty');
	});
});
