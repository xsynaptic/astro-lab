import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { FileRecord } from './file-store.js';
import type { ImageBuild } from './image-state.js';

import { readFileRecords, writeFileRecords } from './file-store.js';
import { readDirectoryTreeIfExists, statIfExists } from './files.js';
import { parseRenditionName } from './image-name.js';
import {
	dropImageManifests,
	getStoreLayout,
	listImageBuilds,
	readBuildNames,
} from './image-state.js';
import { withRenderLock } from './render-lock.js';
import { createSourceFingerprints } from './source-fingerprints.js';
import { UserError } from './user-error.js';

export interface ImageSweepOptions {
	live: string;
	previous?: string;
	retentionDays: { cards: number; renditions: number };
	storePath: string;
}

export interface ImageSweepFile {
	name: string;
	size: number;
}

export interface ImageSweepPlan {
	deletions: ReadonlyArray<ImageSweepFile>;
	directory: string;
	total: number;
}

interface DirectoryPlan extends ImageSweepPlan {
	names: ReadonlyArray<string>;
	records: ReadonlyMap<string, FileRecord>;
}

interface NamedBuild extends ImageBuild {
	names: Awaited<ReturnType<typeof readBuildNames>>;
}

interface SweepRules {
	cutoff: number;
	kept: ReadonlySet<string>;
	records: ReadonlyMap<string, FileRecord>;
	superseded: ReadonlySet<string>;
}

const dayMilliseconds = 24 * 60 * 60 * 1000;

async function readNamedBuilds(storePath: string) {
	const builds = await listImageBuilds(storePath);

	return Promise.all(
		builds.map(async (build): Promise<NamedBuild> => ({
			...build,
			names: await readBuildNames(storePath, build.buildId),
		})),
	);
}

function findBuild(builds: ReadonlyArray<NamedBuild>, storePath: string, buildId: string) {
	const build = builds.find((candidate) => candidate.buildId === buildId);

	if (!build) throw new UserError(`No image manifest for build ${buildId} in ${storePath}`);

	return build;
}

function stampNamedAt(
	records: ReadonlyMap<string, FileRecord>,
	builds: ReadonlyArray<NamedBuild>,
	getNames: (build: NamedBuild) => ReadonlyArray<string>,
	now: Date,
) {
	for (const build of builds) {
		for (const name of getNames(build)) {
			const record = records.get(name);

			if (!record) continue;

			if (record.namedAt === undefined || Date.parse(record.namedAt) < build.writtenAt.getTime()) {
				record.namedAt = build.writtenAt.toISOString();
			}
		}
	}

	for (const record of records.values()) {
		if (record.namedAt === undefined) record.namedAt = now.toISOString();
	}
}

async function findSupersededRenditions(
	storePath: string,
	records: ReadonlyMap<string, FileRecord>,
	live: NamedBuild['names'],
) {
	const liveSources = new Map<string, string>();
	const digests = new Map<string, string | undefined>();
	const superseded = new Set<string>();
	const fingerprints = createSourceFingerprints(storePath);

	for (const [name, sourcePath] of Object.entries(live.renditions)) {
		const stem = parseRenditionName(name)?.stem;

		if (stem !== undefined) liveSources.set(stem, sourcePath);
	}

	async function readDigest(sourcePath: string) {
		if (!digests.has(sourcePath)) {
			const fingerprint = await fingerprints.get(path.resolve(live.mediaPath, sourcePath));

			digests.set(sourcePath, fingerprint?.sha256);
		}

		return digests.get(sourcePath);
	}

	try {
		for (const [name, { source }] of records) {
			if (!source || Object.hasOwn(live.renditions, name)) continue;

			const stem = parseRenditionName(name)?.stem;
			const liveSource = stem === undefined ? undefined : liveSources.get(stem);

			if (liveSource !== undefined && liveSource !== source.path) {
				superseded.add(name);
				continue;
			}

			if ((await readDigest(source.path)) !== source.digest) superseded.add(name);
		}
	} finally {
		fingerprints.close();
	}

	return superseded;
}

function isSwept(name: string, rules: SweepRules) {
	if (name.endsWith('.tmp')) return true;

	if (rules.superseded.has(name)) return true;

	if (rules.kept.has(name)) return false;

	const namedAt = rules.records.get(name)?.namedAt;

	return namedAt === undefined || Date.parse(namedAt) < rules.cutoff;
}

async function listFiles(directory: string) {
	const entries = await readDirectoryTreeIfExists(directory);

	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)));
}

async function planDirectory(directory: string, rules: SweepRules): Promise<DirectoryPlan> {
	const names = await listFiles(directory);
	const sizes = await Promise.all(
		names
			.filter((name) => isSwept(name, rules))
			.map(async (name) => {
				const stats = await statIfExists(path.join(directory, name));

				return stats ? [{ name, size: stats.size }] : [];
			}),
	);

	return {
		deletions: sizes.flat(),
		directory,
		names,
		records: rules.records,
		total: names.length,
	};
}

async function planSweep(storePath: string, { live, previous, retentionDays }: ImageSweepOptions) {
	const { cardsPath, renditionsPath } = getStoreLayout(storePath);
	const now = new Date();
	const builds = await readNamedBuilds(storePath);
	const liveBuild = findBuild(builds, storePath, live);
	const keptBuilds = [
		liveBuild,
		...(previous === undefined ? [] : [findBuild(builds, storePath, previous)]),
		...builds.slice(0, 1),
	];
	const keptIds = new Set(keptBuilds.map((build) => build.buildId));
	const renditionRecords = await readFileRecords(renditionsPath);
	const cardRecords = await readFileRecords(cardsPath);

	stampNamedAt(renditionRecords, builds, (build) => Object.keys(build.names.renditions), now);
	stampNamedAt(cardRecords, builds, (build) => build.names.cards, now);

	const renditions = await planDirectory(renditionsPath, {
		cutoff: now.getTime() - retentionDays.renditions * dayMilliseconds,
		kept: new Set(keptBuilds.flatMap((build) => Object.keys(build.names.renditions))),
		records: renditionRecords,
		superseded: await findSupersededRenditions(storePath, renditionRecords, liveBuild.names),
	});
	const cards = await planDirectory(cardsPath, {
		cutoff: now.getTime() - retentionDays.cards * dayMilliseconds,
		kept: new Set(keptBuilds.flatMap((build) => build.names.cards)),
		records: cardRecords,
		superseded: new Set(),
	});

	return {
		cards,
		dropped: builds.map((build) => build.buildId).filter((buildId) => !keptIds.has(buildId)),
		renditions,
	};
}

async function removeEmptyDirectories(directory: string) {
	const entries = await readDirectoryTreeIfExists(directory);
	const directories = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.join(entry.parentPath, entry.name))
		.toSorted((first, second) => second.length - first.length);

	for (const directoryPath of directories) {
		const remaining = await fs.readdir(directoryPath);

		if (remaining.length === 0) await fs.rmdir(directoryPath);
	}
}

function toPlan({ deletions, directory, total }: ImageSweepPlan): ImageSweepPlan {
	return { deletions, directory, total };
}

async function sweepDirectory(planned: ImageSweepPlan, current: DirectoryPlan) {
	const plannedNames = new Set(planned.deletions.map((file) => file.name));
	const removed = current.deletions.filter((file) => plannedNames.has(file.name));
	const removedNames = new Set(removed.map((file) => file.name));

	await Promise.all(
		removed.map((file) => fs.rm(path.join(current.directory, file.name), { force: true })),
	);
	await removeEmptyDirectories(current.directory);

	if (current.records.size > 0) {
		const remaining = new Set(current.names.filter((name) => !removedNames.has(name)));

		await writeFileRecords(
			current.directory,
			new Map([...current.records].filter(([name]) => remaining.has(name))),
		);
	}

	return toPlan({ ...current, deletions: removed });
}

export async function prepareImageSweep(options: ImageSweepOptions) {
	const storePath = path.resolve(options.storePath);
	const { cardsPath, renditionsPath } = getStoreLayout(storePath);
	const planned = await planSweep(storePath, options);

	function run() {
		return withRenderLock(renditionsPath, () =>
			withRenderLock(cardsPath, async () => {
				const current = await planSweep(storePath, options);
				const renditions = await sweepDirectory(planned.renditions, current.renditions);
				const cards = await sweepDirectory(planned.cards, current.cards);

				await dropImageManifests(storePath, current.dropped);

				return { cards, droppedBuilds: current.dropped, renditions };
			}),
		);
	}

	return { cards: toPlan(planned.cards), renditions: toPlan(planned.renditions), run };
}

export type PreparedImageSweep = Awaited<ReturnType<typeof prepareImageSweep>>;
