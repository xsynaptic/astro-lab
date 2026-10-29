import { availableParallelism } from 'node:os';
import path from 'node:path';
import pLimit from 'p-limit';

import type { StoredFile } from './file-store.js';

import { createFileStore } from './file-store.js';
import { formatList } from './format.js';
import { withRenderLock } from './render-lock.js';

const saveInterval = 10_000;

export interface RenderJob extends StoredFile {
	render: () => Promise<Uint8Array>;
}

export interface RenderCounts {
	fresh: number;
	overwritten: number;
	rendered: number;
	written: number;
}

export interface RenderFailure {
	message: string;
	name: string;
}

export interface RenderJobOptions {
	concurrency?: number;
	directory: string;
	jobs: ReadonlyArray<RenderJob>;
	onFailure?: 'report' | 'throw';
	onProgress?: (progress: RenderCounts & { done: number; total: number }) => void;
	onReplace?: (name: string) => Promise<void>;
	signal?: AbortSignal;
}

// sharp runs each job on a libuv thread, so jobs beyond the pool size would only queue
export function getDefaultConcurrency() {
	return Math.min(availableParallelism(), Number(process.env.UV_THREADPOOL_SIZE) || 4);
}

export function runRenderJobs(options: RenderJobOptions) {
	const directory = path.resolve(options.directory);

	return withRenderLock(directory, () => runJobs({ ...options, directory }));
}

async function runJobs({
	concurrency = getDefaultConcurrency(),
	directory,
	jobs,
	onFailure = 'throw',
	onProgress,
	onReplace,
	signal,
}: RenderJobOptions) {
	const counts: RenderCounts = { fresh: 0, overwritten: 0, rendered: 0, written: 0 };
	const store = await createFileStore({
		directory,
		onReplace: async (name) => {
			counts.overwritten++;
			await onReplace?.(name);
		},
	});
	const limit = pLimit(concurrency);
	const saveLimit = pLimit(1);
	const save = () => saveLimit(() => store.save());
	const failures: Array<RenderFailure> = [];
	let done = 0;
	let lastSave = Date.now();

	async function runJob(job: RenderJob) {
		if (store.isFresh(job.name, job.key)) {
			counts.fresh++;
			store.record(job);
			return;
		}

		const data = await job.render();

		counts.rendered++;
		if (await store.write(job, data)) counts.written++;
	}

	await Promise.all(
		jobs.map((job) =>
			limit(async () => {
				if (signal?.aborted) return;

				try {
					await runJob(job);
				} catch (error) {
					failures.push({
						message: error instanceof Error ? error.message : String(error),
						name: job.name,
					});
				}

				done++;
				onProgress?.({ ...counts, done, total: jobs.length });

				if (Date.now() - lastSave < saveInterval) return;

				lastSave = Date.now();
				await save();
			}),
		),
	);

	await save();
	signal?.throwIfAborted();

	const sortedFailures = failures.toSorted((first, second) =>
		first.name.localeCompare(second.name),
	);

	if (onFailure === 'throw' && sortedFailures.length > 0) {
		throw new Error(
			`${String(sortedFailures.length)} files failed to render:\n${formatList(sortedFailures.map(({ message, name }) => `${name}: ${message}`))}`,
		);
	}

	return { ...counts, failures: sortedFailures, total: jobs.length };
}
