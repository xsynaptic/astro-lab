import { describe, expect, test } from 'vitest';

import { formatDuration, formatProgressText } from '../src/output/format.js';
import { captureOutput, createStatus } from '../src/output/output.js';
import { createProgress, createRateWindow, withSpinner, withStep } from '../src/output/progress.js';

describe('createProgress', () => {
	test('reports the last tick even when the throttle swallowed it', async () => {
		const { events } = await captureOutput(() => {
			const progress = createProgress({ label: 'Rendering', total: 4 });

			progress.tick();
			progress.tick(3);
			progress.succeed();

			return Promise.resolve();
		});

		const progressDone = events.flatMap((event) => (event.type === 'progress' ? [event.done] : []));
		const statusTexts = events.flatMap((event) => (event.type === 'status' ? [event.text] : []));

		expect(progressDone).toEqual([1, 4]);
		expect(statusTexts.at(-1)).toMatch(/^Rendering 4 \/ 4 \(100%\)/);
	});
});

describe('withStep', () => {
	test('closes as a warning when the task flags one, carrying the duration apart from the text', async () => {
		const { events } = await captureOutput(() =>
			withStep('Pulling stats', (step) => {
				step.warn();

				return Promise.resolve();
			}),
		);

		expect(events.at(-1)).toMatchObject({
			durationMs: expect.any(Number),
			state: 'warn',
			text: 'Pulling stats',
		});
	});
});

describe('withStep outcomes', () => {
	test('closes with the text its describe makes of the result', async () => {
		const { events, result } = await captureOutput(() =>
			withStep(
				'Uploading',
				() => Promise.resolve({ changed: 7 }),
				({ changed }) => `Uploaded · ${String(changed)} changed`,
			),
		);

		expect(result).toEqual({ changed: 7 });
		expect(events.at(-1)).toMatchObject({
			durationMs: expect.any(Number),
			state: 'succeed',
			text: 'Uploaded · 7 changed',
		});
	});

	test('carries the detail a warning names', async () => {
		const { events } = await captureOutput(() =>
			withStep('Pulling stats', (step) => {
				step.warn('503 Service Unavailable');

				return Promise.resolve();
			}),
		);

		expect(events.at(-1)).toMatchObject({ detail: '503 Service Unavailable', state: 'warn' });
	});

	test('closes as skipped with its bare text and the reason', async () => {
		const { events } = await captureOutput(() =>
			withStep(
				'Fetching webmentions',
				(step) => {
					step.skip('WEBMENTIONS_SHOW is off');

					return Promise.resolve(3);
				},
				(count) => `Fetched ${String(count)}`,
			),
		);

		expect(events.at(-1)).toMatchObject({
			detail: 'WEBMENTIONS_SHOW is off',
			state: 'skip',
			text: 'Fetching webmentions',
		});
	});
});

describe('withStep folding several outcomes', () => {
	test('keeps every warning detail, and a warning outranks a skip whatever the order', async () => {
		const { events } = await captureOutput(() =>
			withStep('Backing up databases', (step) => {
				step.warn('comments: 503 Service Unavailable');
				step.skip('stats: fresh');
				step.warn('listens: timed out');

				return Promise.resolve();
			}),
		);

		expect(events.at(-1)).toMatchObject({
			detail: 'comments: 503 Service Unavailable\nlistens: timed out',
			state: 'warn',
		});
	});

	test('keeps every skip reason', async () => {
		const { events } = await captureOutput(() =>
			withStep('Backing up databases', (step) => {
				step.skip('comments: fresh');
				step.skip('stats: fresh');

				return Promise.resolve();
			}),
		);

		expect(events.at(-1)).toMatchObject({
			detail: 'comments: fresh\nstats: fresh',
			state: 'skip',
		});
	});
});

describe('status closes', () => {
	test('every close but a stop carries its duration', async () => {
		const { events } = await captureOutput(async () => {
			await withSpinner('Loading content', () => Promise.resolve());
			createStatus('Listing').stop();
			createProgress({ label: 'Rendering', total: 1 }).succeed();
		});
		const closes = events.flatMap((event) =>
			event.type === 'status' && event.state !== 'start' ? [event] : [],
		);

		expect(closes.map((event) => [event.state, typeof event.durationMs])).toEqual([
			['succeed', 'number'],
			['stop', 'undefined'],
			['succeed', 'number'],
		]);
	});
});

describe('createRateWindow', () => {
	test('has no rate until two samples are apart in time', () => {
		const rateWindow = createRateWindow();

		rateWindow.add(0, 1000);

		expect(rateWindow.perSecond()).toBeUndefined();
	});

	test('forgets an early cached burst once it leaves the window', () => {
		const rateWindow = createRateWindow(10_000);

		rateWindow.add(0, 0);
		rateWindow.add(1000, 1000);
		rateWindow.add(1010, 12_000);
		rateWindow.add(1020, 13_000);

		expect(rateWindow.perSecond()).toBe(10);
	});
});

describe('formatProgressText', () => {
	test('shows counts, percent, rate and time left', () => {
		expect(
			formatProgressText({ done: 51_160, label: 'Encoding', perSecond: 280, total: 66_647 }),
		).toBe('Encoding 51,160 / 66,647 (76%) · 280/s · ~55.3s left');
	});

	test('leaves out rate and time left before a rate exists', () => {
		expect(formatProgressText({ done: 0, label: 'Encoding', total: 10 })).toBe(
			'Encoding 0 / 10 (0%)',
		);
	});

	test('treats an empty run as complete', () => {
		expect(formatProgressText({ done: 0, label: 'Checking', perSecond: 0, total: 0 })).toBe(
			'Checking 0 / 0 (100%)',
		);
	});

	test('drops time left once done, keeping the rate and note', () => {
		expect(
			formatProgressText({
				done: 40,
				label: 'Embedding',
				note: '30 cached, 10 generated',
				perSecond: 2.5,
				total: 40,
			}),
		).toBe('Embedding 40 / 40 (100%) · 2.5/s · 30 cached, 10 generated');
	});

	test('switches to minutes for long waits', () => {
		expect(formatProgressText({ done: 0, label: 'Encoding', perSecond: 1, total: 125 })).toBe(
			'Encoding 0 / 125 (0%) · 1.0/s · ~2m 05s left',
		);
	});
});

describe('formatDuration', () => {
	test('carries rounded seconds into the minute', () => {
		expect(formatDuration(119_600)).toBe('2m 00s');
	});

	test('counts milliseconds below a second', () => {
		expect(formatDuration(12.4)).toBe('12ms');
		expect(formatDuration(999.6)).toBe('1.0s');
	});
});
