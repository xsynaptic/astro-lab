import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { readFileIfExists } from './files.js';
import { UserError } from './user-error.js';

// Linking a finished file means the lock never exists without its pid
async function didClaimLock(lockPath: string) {
	const temporary = `${lockPath}.${randomUUID()}.tmp`;

	await fs.writeFile(temporary, String(process.pid));

	try {
		await fs.link(temporary, lockPath);

		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;

		throw error;
	} finally {
		await fs.rm(temporary, { force: true });
	}
}

function isProcessAlive(pid: number) {
	try {
		process.kill(pid, 0);

		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== 'ESRCH';
	}
}

async function readLockHolder(lockPath: string) {
	const data = await readFileIfExists(lockPath);

	return data?.toString('utf8');
}

function isLiveHolder(holder: string) {
	const pid = Number(holder.trim());

	return Number.isSafeInteger(pid) && pid > 0 && isProcessAlive(pid);
}

// Without the break lock and the re-read, two takeovers can delete each other's fresh lock
async function breakStaleLock(lockPath: string, staleHolder: string) {
	const breakPath = `${lockPath}.break`;

	if (!(await didClaimLock(breakPath))) {
		const breaker = await readLockHolder(breakPath);

		if (breaker !== undefined && !isLiveHolder(breaker)) {
			throw new UserError(
				`A render died while taking over the stale lock at ${lockPath}; delete ${breakPath}`,
			);
		}

		throw new UserError(`Another render is taking over the stale lock at ${lockPath}`);
	}

	try {
		if ((await readLockHolder(lockPath)) === staleHolder) await fs.rm(lockPath, { force: true });
	} finally {
		await fs.rm(breakPath, { force: true });
	}
}

async function acquireRenderLock(directory: string) {
	const lockPath = `${directory}.lock`;

	await fs.mkdir(path.dirname(lockPath), { recursive: true });

	if (await didClaimLock(lockPath)) return lockPath;

	const holder = await readLockHolder(lockPath);

	if (holder !== undefined && isLiveHolder(holder)) {
		throw new UserError(`Another render (pid ${holder.trim()}) holds ${lockPath}`);
	}

	if (holder !== undefined) await breakStaleLock(lockPath, holder);

	if (await didClaimLock(lockPath)) return lockPath;

	throw new UserError(`Another render claimed the lock at ${lockPath} first`);
}

// The lock sits beside the output directory, which is rsynced whole
export async function withRenderLock<Result>(directory: string, run: () => Promise<Result>) {
	const lockPath = await acquireRenderLock(directory);

	try {
		return await run();
	} finally {
		await fs.rm(lockPath, { force: true });
	}
}
