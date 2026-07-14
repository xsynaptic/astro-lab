import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, test, vi } from 'vitest';

import type { FileChangeQueueItem } from '../src/types.js';

import { createChangeQueue } from '../src/change-queue.js';

const debounceMs = 10;

// A manually-resolved promise to gate batch processing
function createGate() {
	let resolve!: () => void;
	const promise = new Promise<void>((resolveFn) => {
		resolve = resolveFn;
	});

	return { promise, resolve };
}

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

	test('items queued mid-batch are processed by the next batch, not lost', async () => {
		const processed: Array<string> = [];
		const firstGate = createGate();

		const queue = createChangeQueue({
			debounceMs: debounceMs,
			onBatchEnd: vi.fn(),
			onBatchStart: vi.fn(),
			onError: vi.fn(),
			processChange: async (change) => {
				if (change.filePath === 'a.jpg') await firstGate.promise;
				processed.push(change.filePath);
			},
		});

		queue.add(makeChange('a.jpg'));

		// Let batch 1 start and block on the gate
		await delay(debounceMs * 3);

		// This lands while batch 1 is still processing; the old implementation lost it
		queue.add(makeChange('b.jpg'));

		await delay(debounceMs * 3);

		firstGate.resolve();

		await vi.waitFor(() => {
			expect(processed).toEqual(['a.jpg', 'b.jpg']);
		});
	});

	test('batches never overlap', async () => {
		const events: Array<string> = [];
		const firstGate = createGate();

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
});
