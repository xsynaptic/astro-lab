import { afterEach, describe, expect, test, vi } from 'vitest';

import { captureOutput, configureOutput, log } from '../src/output/output.js';
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
			{ text: 'Missing 3', type: 'data', value: { missing: 3 } },
			expect.objectContaining({ state: 'start', text: 'Checking', type: 'status' }),
			expect.objectContaining({ state: 'succeed', text: 'Checking', type: 'status' }),
		]);
		expect(write).not.toHaveBeenCalled();
	});
});
