import { createHash } from 'node:crypto';
import { createReadStream, promises as fs, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pipeline } from 'node:stream/promises';

import type { ImageDimensions } from './image-sizes.js';

import { readSourceSize } from './image-render.js';

interface SourceFingerprint extends ImageDimensions {
	sha256: string;
}

export interface SourceFingerprints {
	close(): void;
	get(filePath: string): Promise<SourceFingerprint | undefined>;
}

async function getFileStats(filePath: string) {
	try {
		return await fs.stat(filePath);
	} catch {
		return;
	}
}

function openDatabase(storePath: string) {
	mkdirSync(storePath, { recursive: true });

	const database = new DatabaseSync(path.join(storePath, 'source-fingerprints.sqlite'));

	database.exec(
		'PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL',
	);
	database.exec(
		'CREATE TABLE IF NOT EXISTS fingerprints (path TEXT PRIMARY KEY, version TEXT NOT NULL, sha256 TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL)',
	);

	return database;
}

export function createSourceFingerprints(storePath: string): SourceFingerprints {
	const database = openDatabase(storePath);
	const selectStatement = database.prepare(
		'SELECT sha256, width, height FROM fingerprints WHERE path = ? AND version = ?',
	);
	const upsertStatement = database.prepare(
		'INSERT INTO fingerprints (path, version, sha256, width, height) VALUES (?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET version = excluded.version, sha256 = excluded.sha256, width = excluded.width, height = excluded.height',
	);

	return {
		close() {
			database.close();
		},

		async get(filePath) {
			const absolutePath = path.resolve(filePath);
			const stats = await getFileStats(absolutePath);

			if (!stats) return;

			const version = `${String(stats.mtimeMs)}:${String(stats.size)}`;
			const cached = selectStatement.get(absolutePath, version) as SourceFingerprint | undefined;

			if (cached) return { height: cached.height, sha256: cached.sha256, width: cached.width };

			const digest = createHash('sha256');

			await pipeline(createReadStream(absolutePath), digest);

			const { height, width } = await readSourceSize(absolutePath);
			const fingerprint = { height, sha256: digest.digest('hex'), width };

			upsertStatement.run(absolutePath, version, fingerprint.sha256, width, height);

			return fingerprint;
		},
	};
}
