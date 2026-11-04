import { fc, test } from '@fast-check/vitest';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, vi } from 'vitest';

import type { FileChangeQueueItem } from '../src/types.js';

import { createChangeQueue } from '../src/change-queue.js';

const debounceMs = 10;

function makeChange(filePath: string, type: FileChangeQueueItem['type'] = 'change') {
	return { filePath, id: filePath, type };
}

describe('createChangeQueue', () => {
	test('debounces multiple adds into a single batch', async () => {
		const processed: Array<string> = [];
		const hooks: Array<string> = [];

		const queue = createChangeQueue({
			debounceMs: debounceMs,
			onBatchEnd: () => {
				hooks.push('end');
			},
			onBatchStart: () => {
				hooks.push('start');
			},
			onError: vi.fn(),
			processChange: async (change) => {
				processed.push(change.filePath);
				await Promise.resolve();
			},
		});

		queue.add(makeChange('a.jpg'));
		queue.add(makeChange('b.jpg'));

		await vi.waitFor(() => {
			expect(processed).toEqual(['a.jpg', 'b.jpg']);
		});
		expect(hooks).toEqual(['start', 'end']);
	});

	test('batches never overlap', async () => {
		const events: Array<string> = [];
		const firstGate: PromiseWithResolvers<void> = Promise.withResolvers();

		const queue = createChangeQueue({
			debounceMs: debounceMs,
			onBatchEnd: () => {
				events.push('end');
			},
			onBatchStart: () => {
				events.push('start');
			},
			onError: vi.fn(),
			processChange: async (change) => {
				if (change.filePath === 'a.jpg') await firstGate.promise;
				events.push(`process:${change.filePath}`);
			},
		});

		queue.add(makeChange('a.jpg'));
		await delay(debounceMs * 3);
		queue.add(makeChange('b.jpg'));
		await delay(debounceMs * 3);
		firstGate.resolve();

		await vi.waitFor(() => {
			expect(events).toEqual(['start', 'process:a.jpg', 'end', 'start', 'process:b.jpg', 'end']);
		});
	});

	test('a failing item does not abort the rest of the batch', async () => {
		const processed: Array<string> = [];
		const onError = vi.fn();

		const queue = createChangeQueue({
			debounceMs: debounceMs,
			onBatchEnd: vi.fn(),
			onBatchStart: vi.fn(),
			onError,
			processChange: async (change) => {
				if (change.filePath === 'a.jpg') throw new Error('boom');
				processed.push(change.filePath);
				await Promise.resolve();
			},
		});

		queue.add(makeChange('a.jpg'));
		queue.add(makeChange('b.jpg'));

		await vi.waitFor(() => {
			expect(processed).toEqual(['b.jpg']);
		});
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0]?.[1]).toMatchObject({ filePath: 'a.jpg' });
	});

	test('a failing batch hook routes to onError and does not break later batches', async () => {
		const processed: Array<string> = [];
		const onError = vi.fn();

		let isFailStart = true;

		const queue = createChangeQueue({
			debounceMs: debounceMs,
			onBatchEnd: vi.fn(),
			onBatchStart: () => {
				if (isFailStart) throw new Error('setup failed');
			},
			onError,
			processChange: async (change) => {
				processed.push(change.filePath);
				await Promise.resolve();
			},
		});

		queue.add(makeChange('a.jpg'));

		await vi.waitFor(() => {
			expect(onError).toHaveBeenCalledTimes(1);
		});
		expect(processed).toEqual([]);

		isFailStart = false;
		queue.add(makeChange('b.jpg'));

		await vi.waitFor(() => {
			expect(processed).toEqual(['b.jpg']);
		});
	});

	test('deduplicates changes for the same path, keeping the latest type', async () => {
		const processed: Array<FileChangeQueueItem> = [];

		const queue = createChangeQueue({
			debounceMs: debounceMs,
			onBatchEnd: vi.fn(),
			onBatchStart: vi.fn(),
			onError: vi.fn(),
			processChange: async (change) => {
				processed.push(change);
				await Promise.resolve();
			},
		});

		queue.add(makeChange('a.jpg', 'add'));
		queue.add(makeChange('a.jpg', 'unlink'));

		await vi.waitFor(() => {
			expect(processed).toHaveLength(1);
		});
		expect(processed[0]?.type).toBe('unlink');
	});

	const queueStep = fc.oneof(
		fc.record(
			{
				filePath: fc.constantFrom('a.jpg', 'b.jpg'),
				kind: fc.constant('add' as const),
				type: fc.constantFrom<FileChangeQueueItem['type']>('add', 'change', 'unlink'),
			},
			{ noNullPrototype: true },
		),
		fc.record({ kind: fc.constant('release' as const) }, { noNullPrototype: true }),
		fc.record(
			{ kind: fc.constant('wait' as const), ms: fc.constantFrom(0, 5, debounceMs, 25) },
			{ noNullPrototype: true },
		),
	);

	async function settle(scheduler: fc.Scheduler) {
		for (let round = 0; round < 100; round++) {
			await vi.runAllTimersAsync();

			if (scheduler.count() === 0 && vi.getTimerCount() === 0) return;

			await scheduler.waitIdle();
		}

		throw new Error('The queue never settled');
	}

	test.prop([fc.scheduler(), fc.array(queueStep, { maxLength: 30, size: 'max' })])(
		'batches never overlap, and each path ends on its latest change, processed after it was added',
		async (scheduler, steps) => {
			vi.useFakeTimers();

			try {
				const added: Array<FileChangeQueueItem> = [];
				const processed: Array<{ change: FileChangeQueueItem; startedAfter: number }> = [];
				let activeBatches = 0;
				let overlaps = 0;

				const queue = createChangeQueue({
					debounceMs,
					onBatchEnd: async () => {
						await scheduler.schedule(Promise.resolve());
						activeBatches--;
					},
					onBatchStart: async () => {
						if (activeBatches > 0) overlaps++;
						activeBatches++;
						await scheduler.schedule(Promise.resolve());
					},
					onError: (error) => {
						throw error;
					},
					processChange: async (change) => {
						processed.push({ change, startedAfter: added.length });
						await scheduler.schedule(Promise.resolve());
					},
				});

				for (const step of steps) {
					if (step.kind === 'add') {
						const change = {
							filePath: step.filePath,
							id: `${step.filePath}#${String(added.length)}`,
							type: step.type,
						};

						added.push(change);
						queue.add(change);
					} else if (step.kind === 'wait') {
						await vi.advanceTimersByTimeAsync(step.ms);
					} else if (scheduler.count() > 0) {
						await scheduler.waitNext(1);
					}
				}

				await settle(scheduler);

				expect(overlaps).toBe(0);
				expect(new Set(processed.map(({ change }) => change.id)).size).toBe(processed.length);

				for (const [index, change] of added.entries()) {
					const later = processed.filter(
						(entry) =>
							entry.change.filePath === change.filePath &&
							Number(entry.change.id.split('#', 2)[1]) >= index &&
							entry.startedAfter > index,
					);

					expect(later.length, `${change.id} was never processed or superseded`).toBeGreaterThan(0);
				}

				const addedPaths = new Set(added.map((change) => change.filePath));

				for (const filePath of addedPaths) {
					const last = added.findLast((change) => change.filePath === filePath);
					const lastProcessed = processed.findLast((entry) => entry.change.filePath === filePath);

					expect(lastProcessed?.change).toBe(last);
				}
			} finally {
				vi.useRealTimers();
			}
		},
	);
});
