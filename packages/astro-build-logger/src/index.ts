import type { AstroIntegration } from 'astro';

import astroPackage from 'astro/package.json' with { type: 'json' };
import { appendFile, readdir, stat } from 'node:fs/promises';
import { z } from 'zod';

const optionsSchema = z
	.object({
		/**
		 * Path to the JSONL log file
		 *
		 * @default `"astro-build.jsonl"`
		 */
		logFileName: z.string().optional(),
	})
	.optional();

interface BuildLogEntry {
	astroVersion: string;
	durationSeconds: number;
	nodeVersion: string;
	notes?: string;
	outputBytes: number;
	pageCount: number;
	summary: string;
	timestamp: string;
}

type Options = z.input<typeof optionsSchema>;

export default function buildLogger(options?: Options): AstroIntegration {
	const parsed = optionsSchema.parse(options);
	const logFileName = parsed?.logFileName ?? 'astro-build.jsonl';

	let buildStartTime: number;

	return {
		hooks: {
			'astro:build:done': async ({ dir, logger, pages }) => {
				const buildEndTime = Date.now();
				const durationSeconds = Number(((buildEndTime - buildStartTime) / 1000).toFixed(2));
				const outputBytes = await getDirectorySize(dir);
				const summary = formatSummary(durationSeconds, pages.length, outputBytes);

				const entry: BuildLogEntry = {
					astroVersion: astroPackage.version,
					durationSeconds,
					nodeVersion: process.versions.node,
					outputBytes,
					pageCount: pages.length,
					summary,
					timestamp: new Date(buildEndTime).toISOString(),
				};

				try {
					await appendFile(logFileName, JSON.stringify(entry) + '\n');
					logger.info(`Build time logged: ${summary}`);
				} catch (error) {
					logger.error(
						`Failed to write build log: ${error instanceof Error ? error.message : 'unknown error'}`,
					);
				}
			},
			'astro:build:start': ({ logger }) => {
				buildStartTime = Date.now();
				logger.info(`Build timing started at ${new Date(buildStartTime).toISOString()}`);
			},
		},
		name: '@xsynaptic/astro-build-logger',
	};
}

function formatBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB'];
	let value = bytes;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	const precision = unitIndex === 0 || value >= 10 ? 0 : 1;

	return `${value.toFixed(precision)} ${units[unitIndex] ?? 'B'}`;
}

function formatDuration(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = Math.round(totalSeconds % 60);

	if (hours > 0) return `${String(hours)}h ${String(minutes)}m ${String(seconds)}s`;
	if (minutes > 0) return `${String(minutes)}m ${String(seconds)}s`;

	return `${String(seconds)}s`;
}

function formatSummary(durationSeconds: number, pageCount: number, outputBytes: number): string {
	return `${formatDuration(durationSeconds)} (${String(pageCount)} pages, ${formatBytes(outputBytes)})`;
}

async function getDirectorySize(dir: URL): Promise<number> {
	const entries = await readdir(dir, { withFileTypes: true });
	let total = 0;

	for (const entry of entries) {
		const child = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, dir);

		if (entry.isDirectory()) {
			total += await getDirectorySize(child);
		} else if (entry.isFile()) {
			const stats = await stat(child);
			total += stats.size;
		}
	}
	return total;
}
