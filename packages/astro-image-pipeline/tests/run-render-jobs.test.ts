import type * as nodeFs from 'node:fs';

import { fc, test } from '@fast-check/vitest';
import { existsSync, promises as fs, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import type { RenderJob } from '../src/run-render-jobs.js';

import { writeFileRecords } from '../src/file-store.js';
import { runRenderJobs } from '../src/run-render-jobs.js';

// Gated calls land through their sync twins; real async I/O would leave the scheduler one task to release
const killedError = vi.hoisted(() => new Error('killed'));

const fsGate = vi.hoisted(() => ({
	afterCall: undefined as (() => void) | undefined,
	isActive: false,
	isKilled: false,
	tick: undefined as (() => Promise<void>) | undefined,
}));

vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof nodeFs>();
	const promises = new Proxy(actual.promises, {
		get(target, property, receiver) {
			const value: unknown = Reflect.get(target, property, receiver);
			const sync: unknown = Reflect.get(actual, `${String(property)}Sync`);

			if (typeof value !== 'function' || typeof sync !== 'function') return value;

			return async (...args: Array<unknown>) => {
				if (!fsGate.isActive) return Reflect.apply(value, target, args) as unknown;

				await fsGate.tick?.();

				if (fsGate.isKilled) throw killedError;

				try {
					return Reflect.apply(sync, actual, args) as unknown;
				} finally {
					fsGate.afterCall?.();
				}
			};
		},
	});

	return { ...actual, promises };
});

let directory: string;

function createJob(name: string, key = 'key'): RenderJob {
	return { key, name, render: () => Promise.resolve(new TextEncoder().encode(name)) };
}

function run(jobs: ReadonlyArray<RenderJob>) {
	return runRenderJobs({ directory, jobs });
}

beforeEach(async () => {
	const root = await fs.mkdtemp(path.join(tmpdir(), 'run-render-jobs-'));

	directory = path.join(root, 'files');
});

afterEach(async () => {
	await fs.rm(path.dirname(directory), { force: true, recursive: true });
});

describe('runRenderJobs', () => {
	test('a recorded key without its file is stale, so a cleared directory redraws', async () => {
		await run([createJob('a.jpg')]);
		await fs.rm(path.join(directory, 'a.jpg'));

		const counts = await run([createJob('a.jpg')]);

		expect(counts.rendered).toBe(1);
		expect(existsSync(path.join(directory, 'a.jpg'))).toBe(true);
	});

	test('a store copied without its mtimes redraws once and writes nothing', async () => {
		const jobs = [createJob('a.jpg'), createJob('b.jpg')];
		const copiedAt = new Date('2026-01-01T00:00:00Z');

		await run(jobs);

		for (const job of jobs) await fs.utimes(path.join(directory, job.name), copiedAt, copiedAt);

		expect(await run(jobs)).toMatchObject({ rendered: 2, written: 0 });
		expect(await run(jobs)).toMatchObject({ fresh: 2 });
	});

	test('a changed key renders again, and identical bytes leave the file unwritten', async () => {
		await run([createJob('a.jpg'), createJob('b.jpg')]);

		const jobs = [createJob('a.jpg'), createJob('b.jpg', 'other')];

		expect(await run(jobs)).toMatchObject({ fresh: 1, rendered: 1, written: 0 });
	});

	test('a reported failure leaves the other jobs written and its own name stale', async () => {
		const failing = {
			key: 'key',
			name: 'b.jpg',
			render: () => Promise.reject(new Error('broken')),
		} satisfies RenderJob;
		const counts = await runRenderJobs({
			directory,
			jobs: [createJob('a.jpg'), failing],
			onFailure: 'report',
		});

		expect(counts.failures).toEqual([{ message: 'broken', name: 'b.jpg' }]);
		expect(await run([createJob('a.jpg'), createJob('b.jpg')])).toMatchObject({
			fresh: 1,
			rendered: 1,
		});
	});

	// k2 and k3 render the same bytes, so the identical-bytes path is reached too
	const renderedBytes = { k1: 'one', k2: 'two', k3: 'two' } as const;

	type RenderKey = keyof typeof renderedBytes;

	const renderKey = fc.constantFrom<RenderKey>('k1', 'k2', 'k3');

	const names = ['a', 'b', 'c'];

	// Names are unique within a run, as manifest and card keys make them; the runtime enforces it
	const renderRun = fc.record(
		{
			concurrency: fc.integer({ max: 3, min: 1 }),
			existing: fc.tuple(...names.map(() => fc.option(renderKey, { nil: undefined }))),
			jobs: fc.tuple(
				...names.map(() =>
					fc.option(fc.record({ fails: fc.boolean(), key: renderKey }, { noNullPrototype: true }), {
						nil: undefined,
					}),
				),
			),
		},
		{ noNullPrototype: true },
	);

	// A record left from before the run can trail its file until the next save; one this run wrote cannot
	function findMismatches(initial: ReadonlyMap<string, RenderKey>) {
		const recordsPath = `${directory}-keys.json`;

		if (!existsSync(recordsPath)) return [];

		const { files } = JSON.parse(readFileSync(recordsPath, 'utf8')) as {
			files: Record<string, { key: RenderKey }>;
		};

		return Object.entries(files).filter(([name, { key }]) => {
			const filePath = path.join(directory, name);

			return (
				initial.get(name) !== key &&
				existsSync(filePath) &&
				readFileSync(filePath, 'utf8') !== renderedBytes[key]
			);
		});
	}

	const existingTime = new Date('2026-01-01T00:00:00Z');

	async function writeExisting(existing: ReadonlyArray<RenderKey | undefined>) {
		const initial = new Map<string, RenderKey>();
		const records = new Map<string, { key: RenderKey; mtimeMs: number; size: number }>();

		await fs.rm(directory, { force: true, recursive: true });
		await fs.mkdir(directory, { recursive: true });

		for (const [index, name] of names.entries()) {
			const key = existing[index];

			if (key === undefined) continue;

			const filePath = path.join(directory, name);

			await fs.writeFile(filePath, renderedBytes[key]);
			await fs.utimes(filePath, existingTime, existingTime);

			const { mtimeMs, size } = await fs.stat(filePath);

			initial.set(name, key);
			records.set(name, { key, mtimeMs, size });
		}

		await writeFileRecords(directory, records);

		return initial;
	}

	function createGatedJobs(
		scheduler: fc.Scheduler,
		jobs: ReadonlyArray<undefined | { fails: boolean; key: RenderKey }>,
	) {
		return names.flatMap((name, index): Array<RenderJob> => {
			const job = jobs[index];

			if (!job) return [];

			return [
				{
					key: job.key,
					name,
					render: async () => {
						await scheduler.schedule(Promise.resolve());

						if (job.fails) throw new Error(`${name} failed`);

						return new TextEncoder().encode(renderedBytes[job.key]);
					},
				},
			];
		});
	}

	async function runGated(scheduler: fc.Scheduler, start: () => Promise<unknown>) {
		let clock = 0;

		vi.spyOn(Date, 'now').mockImplementation(() => (clock += 10_000));
		fsGate.tick = () => scheduler.schedule(Promise.resolve());
		fsGate.isActive = true;

		try {
			await scheduler.waitFor(start());
		} finally {
			fsGate.afterCall = undefined;
			fsGate.isActive = false;
			fsGate.isKilled = false;
			vi.restoreAllMocks();
		}
	}

	test.prop([fc.scheduler(), renderRun])(
		'a key the run records never reaches disk before the bytes rendered from it',
		async (scheduler, { concurrency, existing, jobs }) => {
			const initial = await writeExisting(existing);
			const mismatches: Array<[string, { key: RenderKey }]> = [];

			fsGate.afterCall = () => {
				mismatches.push(...findMismatches(initial));
			};

			await runGated(scheduler, () =>
				runRenderJobs({
					concurrency,
					directory,
					jobs: createGatedJobs(scheduler, jobs),
					onFailure: 'report',
				}),
			);

			mismatches.push(...findMismatches(initial));

			expect(mismatches).toStrictEqual([]);
		},
		60_000,
	);

	test.prop([fc.scheduler(), renderRun, fc.nat({ max: 40 })])(
		'after a kill at any call, a rerun of the earlier keys leaves their bytes on disk',
		async (scheduler, { concurrency, existing, jobs }, killAt) => {
			const initial = await writeExisting(existing);
			let calls = 0;

			fsGate.afterCall = () => {
				calls++;
				if (calls >= killAt) fsGate.isKilled = true;
			};

			try {
				await runGated(scheduler, () =>
					runRenderJobs({
						concurrency,
						directory,
						jobs: createGatedJobs(scheduler, jobs),
						onFailure: 'report',
					}),
				);
			} catch (error) {
				if (error !== killedError) throw error;
			}

			await fs.rm(`${directory}.lock`, { force: true });
			await runRenderJobs({
				directory,
				jobs: [...initial].map(([name, key]) => ({
					key,
					name,
					render: () => Promise.resolve(new TextEncoder().encode(renderedBytes[key])),
				})),
			});

			const wrong = [...initial].filter(
				([name, key]) => readFileSync(path.join(directory, name), 'utf8') !== renderedBytes[key],
			);

			expect(wrong).toStrictEqual([]);
		},
		60_000,
	);
});
