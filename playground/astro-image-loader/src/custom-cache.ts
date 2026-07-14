import type { ImageLoaderCache } from '@xsynaptic/astro-image-loader';

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// A demo custom cache for the playground, backed by node:sqlite
// Any { get, set, prune? } backend can replace the loader's default JSONL store
export function createSqliteCache({ filePath }: { filePath: string }): ImageLoaderCache {
	mkdirSync(path.dirname(filePath), { recursive: true });

	const db = new DatabaseSync(filePath);

	db.exec(
		'CREATE TABLE IF NOT EXISTS entries (key TEXT PRIMARY KEY, digest TEXT NOT NULL, data TEXT NOT NULL)',
	);

	const selectStmt = db.prepare('SELECT digest, data FROM entries WHERE key = ?');
	const upsertStmt = db.prepare(
		'INSERT OR REPLACE INTO entries (key, digest, data) VALUES (?, ?, ?)',
	);
	const deleteStmt = db.prepare('DELETE FROM entries WHERE key = ?');

	return {
		get: (key) => {
			const row = selectStmt.get(key) as { data: string; digest: string } | undefined;

			if (!row) return undefined;

			return { data: JSON.parse(row.data) as Record<string, unknown>, digest: row.digest };
		},
		set: (key, value) => {
			upsertStmt.run(key, value.digest, JSON.stringify(value.data));
		},
		prune: (liveKeys) => {
			const live = new Set(liveKeys);
			const rows = db.prepare('SELECT key FROM entries').all() as Array<{ key: string }>;

			for (const { key } of rows) {
				if (!live.has(key)) deleteStmt.run(key);
			}
		},
	};
}
