import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { withRenderLock } from '../../src/render-lock.js';

const trials = 40;
const contenders = 8;

let root: string;

function getDeadPid() {
	return spawnSync(process.execPath, ['--eval', '']).pid;
}

async function contend(directory: string) {
	let holders = 0;
	let peak = 0;

	const results = await Promise.allSettled(
		Array.from({ length: contenders }, () =>
			withRenderLock(directory, async () => {
				holders++;
				peak = Math.max(peak, holders);
				await delay(2);
				holders--;
			}),
		),
	);

	const failures = results.flatMap((result) =>
		result.status === 'rejected' ? [result.reason] : [],
	);

	return { failures, peak, settled: results.length - failures.length };
}

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(tmpdir(), 'render-lock-'));
});

afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { force: true, recursive: true });
});

describe('withRenderLock', () => {
	test('lets one of many concurrent renders in and refuses the rest', async () => {
		for (let trial = 0; trial < trials; trial++) {
			const directory = path.join(root, String(trial), 'renditions');
			const { failures, peak, settled } = await contend(directory);

			expect(peak).toBe(1);
			expect(settled).toBeGreaterThanOrEqual(1);
			for (const failure of failures) expect(failure).toHaveProperty('name', 'UserError');
			expect(await fs.readdir(path.dirname(directory))).toEqual([]);
		}
	});

	test('lets one of many concurrent renders take over a dead holder’s lock', async () => {
		const deadPid = String(getDeadPid());

		for (let trial = 0; trial < trials; trial++) {
			const directory = path.join(root, String(trial), 'renditions');

			await fs.mkdir(path.dirname(directory), { recursive: true });
			await fs.writeFile(`${directory}.lock`, deadPid);

			const { failures, peak, settled } = await contend(directory);

			expect(peak).toBe(1);
			expect(settled).toBeGreaterThanOrEqual(1);
			for (const failure of failures) expect(failure).toHaveProperty('name', 'UserError');
			expect(await fs.readdir(path.dirname(directory))).toEqual([]);
		}
	});

	test('a takeover that read the dead pid before another render claimed leaves that render’s lock alone', async () => {
		const directory = path.join(root, 'renditions');
		const lockPath = `${directory}.lock`;
		const deadPid = String(getDeadPid());
		const readFile = fs.readFile.bind(fs);
		const { promise: paused, resolve: pause } = Promise.withResolvers<string>();
		const { promise: holding, resolve: hold } = Promise.withResolvers<undefined>();
		let lockReads = 0;
		let holders = 0;
		let peak = 0;

		await fs.writeFile(lockPath, deadPid);

		vi.spyOn(fs, 'readFile').mockImplementation(async (...args: Parameters<typeof readFile>) => {
			const content = await readFile(...args);

			if (args[0] === lockPath && ++lockReads === 1) {
				pause(String(content));
				await holding;
			}

			return content;
		});

		function run(release: Promise<unknown>) {
			return async () => {
				holders++;
				peak = Math.max(peak, holders);
				hold(undefined);
				await release;
				holders--;
			};
		}

		const late = withRenderLock(directory, run(Promise.resolve()));

		expect(await paused).toBe(deadPid);

		async function claimEarly() {
			try {
				await withRenderLock(directory, run(Promise.allSettled([late])));
			} finally {
				hold(undefined);
			}
		}

		const results = await Promise.allSettled([late, claimEarly()]);

		expect(peak).toBe(1);
		expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled']);
	});

	test('refuses to take over while a dead breaker’s lock remains, and names it', async () => {
		const directory = path.join(root, 'renditions');
		const lockPath = `${directory}.lock`;

		await fs.writeFile(lockPath, String(getDeadPid()));
		await fs.writeFile(`${lockPath}.break`, String(getDeadPid()));

		await expect(withRenderLock(directory, () => Promise.resolve())).rejects.toThrow(
			`delete ${lockPath}.break`,
		);
	});
});
