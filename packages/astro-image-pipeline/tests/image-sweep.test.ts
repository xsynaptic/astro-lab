import { fc, test } from '@fast-check/vitest';
import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect } from 'vitest';

import type { FileRecord } from '../src/file-store.js';
import type { ImageManifest } from '../src/image-state.js';
import type { ImageSweepOptions } from '../src/image-sweep.js';

import { readFileRecords, writeFileRecords } from '../src/file-store.js';
import { resolveImageEncoding } from '../src/image-encoding.js';
import { imageManifestVersion, listImageBuilds, writeImageManifest } from '../src/image-state.js';
import { prepareImageSweep } from '../src/image-sweep.js';
import { UserError } from '../src/user-error.js';

const dayMilliseconds = 24 * 60 * 60 * 1000;

let root: string;
let mediaPath: string;
let renditionsPath: string;
let cardsPath: string;

async function setBuildAge(buildId: string, days: number) {
	const time = new Date(Date.now() - days * dayMilliseconds);

	await fs.utimes(path.join(root, 'manifests', `${buildId}.json.gz`), time, time);
}

async function writeBuild(
	buildId: string,
	days: number,
	{
		cards = [],
		renditions = [],
	}: { cards?: ReadonlyArray<string>; renditions?: ReadonlyArray<string> | Record<string, string> },
) {
	await writeImageManifest(root, {
		buildId,
		cards: Object.fromEntries(cards.map((name) => [name, { input: { title: name } }])),
		encoding: resolveImageEncoding(),
		keepIccProfile: false,
		limitInputPixels: 268_402_689,
		mediaPath,
		renditions: Array.isArray(renditions)
			? Object.fromEntries(renditions.map((name) => [name, 'source.jpg']))
			: renditions,
		version: imageManifestVersion,
	} satisfies ImageManifest);
	await setBuildAge(buildId, days);
}

async function writeFiles(directory: string, records: Record<string, Omit<FileRecord, 'key'>>) {
	for (const name of Object.keys(records)) {
		const filePath = path.join(directory, name);

		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, name);
	}

	await writeFileRecords(
		directory,
		new Map(Object.entries(records).map(([name, record]) => [name, { key: name, ...record }])),
	);
}

async function writeSource(sourcePath: string, background: string) {
	const filePath = path.join(mediaPath, sourcePath);

	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await sharp({ create: { background, channels: 3, height: 600, width: 900 } })
		.jpeg()
		.toFile(filePath);

	return createHash('sha256')
		.update(await fs.readFile(filePath))
		.digest('hex');
}

async function listFiles(directory: string) {
	if (!existsSync(directory)) return [];

	const entries = await fs.readdir(directory, { recursive: true, withFileTypes: true });

	return sortNames(
		entries
			.filter((entry) => entry.isFile())
			.map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name))),
	);
}

async function listBuildIds() {
	const builds = await listImageBuilds(root);

	return sortNames(builds.map((build) => build.buildId));
}

function sortNames(names: Iterable<string>) {
	return [...names].toSorted((first, second) => first.localeCompare(second));
}

function getNames(files: ReadonlyArray<{ name: string }>) {
	return sortNames(files.map((file) => file.name));
}

function sweep(options: Partial<ImageSweepOptions> = {}) {
	return prepareImageSweep({
		live: 'live',
		retentionDays: { cards: 365, renditions: 7 },
		storePath: root,
		...options,
	});
}

async function runSweep(options: Partial<ImageSweepOptions> = {}) {
	const prepared = await sweep(options);

	return prepared.run();
}

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(tmpdir(), 'image-sweep-'));
	mediaPath = path.join(root, 'media');
	renditionsPath = path.join(root, 'renditions');
	cardsPath = path.join(root, 'cards');
});

afterEach(async () => {
	await fs.rm(root, { force: true, recursive: true });
});

describe('prepareImageSweep', () => {
	test('renditions and cards each keep their own window', async () => {
		await writeBuild('stale', 400, { cards: ['stale.jpg'], renditions: ['stale-450.jpg'] });
		await writeBuild('old', 30, { cards: ['old.jpg'], renditions: ['old-450.jpg'] });
		await writeBuild('recent', 3, { renditions: ['recent-450.jpg'] });
		await writeBuild('live', 0, { cards: ['live.jpg'], renditions: ['live-450.jpg'] });
		await writeFiles(renditionsPath, {
			'live-450.jpg': {},
			'old-450.jpg': {},
			'recent-450.jpg': {},
			'stale-450.jpg': {},
		});
		await writeFiles(cardsPath, { 'live.jpg': {}, 'old.jpg': {}, 'stale.jpg': {} });
		await fs.writeFile(path.join(renditionsPath, 'orphan-450.jpg'), 'orphan');

		const prepared = await sweep();

		expect(getNames(prepared.renditions.deletions)).toStrictEqual([
			'old-450.jpg',
			'orphan-450.jpg',
			'stale-450.jpg',
		]);
		expect(prepared.renditions.deletions[0]?.size).toBe('old-450.jpg'.length);
		expect(prepared.renditions.total).toBe(5);
		expect(getNames(prepared.cards.deletions)).toStrictEqual(['stale.jpg']);
		expect(await listFiles(renditionsPath)).toHaveLength(5);

		const result = await prepared.run();

		expect(getNames(result.renditions.deletions)).toStrictEqual([
			'old-450.jpg',
			'orphan-450.jpg',
			'stale-450.jpg',
		]);
		expect(getNames(result.cards.deletions)).toStrictEqual(['stale.jpg']);
		expect(await listFiles(renditionsPath)).toStrictEqual(['live-450.jpg', 'recent-450.jpg']);
		expect(await listFiles(cardsPath)).toStrictEqual(['live.jpg', 'old.jpg']);
		expect(sortNames(result.droppedBuilds)).toStrictEqual(['old', 'recent', 'stale']);
		expect(await listBuildIds()).toStrictEqual(['live']);
	});

	test('a name keeps the age of the newest build that named it once the manifests go', async () => {
		await writeBuild('older', 10, { renditions: ['a-450.jpg'] });
		await writeBuild('newer', 3, { renditions: ['a-450.jpg'] });
		await writeBuild('live', 0, { renditions: ['b-450.jpg'] });
		await writeFiles(renditionsPath, { 'a-450.jpg': {}, 'b-450.jpg': {} });

		const first = await runSweep();

		expect(first.renditions.deletions).toStrictEqual([]);
		expect(await listBuildIds()).toStrictEqual(['live']);

		const kept = await sweep({ retentionDays: { cards: 365, renditions: 4 } });

		expect(kept.renditions.deletions).toStrictEqual([]);

		const expired = await sweep({ retentionDays: { cards: 365, renditions: 2 } });

		expect(getNames(expired.renditions.deletions)).toStrictEqual(['a-450.jpg']);
	});

	test('live, previous and newest builds keep their names past the window', async () => {
		await writeBuild('gone', 40, { cards: ['gone.jpg'], renditions: ['gone-450.jpg'] });
		await writeBuild('previous', 30, { cards: ['previous.jpg'], renditions: ['previous-450.jpg'] });
		await writeBuild('live', 20, { cards: ['live.jpg'], renditions: ['live-450.jpg'] });
		await writeBuild('newest', 10, { cards: ['newest.jpg'], renditions: ['newest-450.jpg'] });
		await writeFiles(renditionsPath, {
			'gone-450.jpg': {},
			'live-450.jpg': {},
			'newest-450.jpg': {},
			'previous-450.jpg': {},
		});
		await writeFiles(cardsPath, {
			'gone.jpg': {},
			'live.jpg': {},
			'newest.jpg': {},
			'previous.jpg': {},
		});

		const result = await runSweep({
			previous: 'previous',
			retentionDays: { cards: 5, renditions: 5 },
		});

		expect(getNames(result.renditions.deletions)).toStrictEqual(['gone-450.jpg']);
		expect(getNames(result.cards.deletions)).toStrictEqual(['gone.jpg']);
		expect(await listBuildIds()).toStrictEqual(['live', 'newest', 'previous']);
	});

	test('a file of unknown age starts its window at the first sweep', async () => {
		await writeBuild('live', 0, { renditions: ['live-450.jpg'] });
		await writeFiles(renditionsPath, { 'live-450.jpg': {}, 'unnamed-450.jpg': {} });
		await writeFiles(cardsPath, { 'unnamed.jpg': {} });

		const result = await runSweep();
		const renditionRecords = await readFileRecords(renditionsPath);
		const cardRecords = await readFileRecords(cardsPath);

		expect(result.renditions.deletions).toStrictEqual([]);
		expect(result.cards.deletions).toStrictEqual([]);
		expect(renditionRecords.get('unnamed-450.jpg')?.namedAt).toBeTypeOf('string');
		expect(cardRecords.get('unnamed.jpg')?.namedAt).toBeTypeOf('string');
	});

	test('an unknown live or previous build refuses the sweep', async () => {
		await writeBuild('live', 0, { renditions: ['a-450.jpg'] });

		await expect(sweep({ live: 'missing' })).rejects.toThrow(/No image manifest for build missing/);
		await expect(sweep({ previous: 'missing' })).rejects.toThrow(
			/No image manifest for build missing/,
		);
	});

	test('a store with no builds refuses rather than deleting everything', async () => {
		await writeFiles(renditionsPath, { 'a-450.jpg': {} });

		await expect(sweep()).rejects.toThrow(UserError);
	});

	test('a kept build from an older manifest version still sweeps', async () => {
		const previousPath = path.join(root, 'manifests', 'previous.json.gz');

		await fs.mkdir(path.dirname(previousPath), { recursive: true });
		await fs.writeFile(
			previousPath,
			gzipSync(
				JSON.stringify({
					mediaPath,
					openGraphCards: {},
					renditions: { 'a-450.jpg': 'source.jpg' },
					version: 6,
				}),
			),
		);
		await setBuildAge('previous', 30);
		await writeBuild('live', 0, { renditions: ['b-450.jpg'] });
		await writeFiles(renditionsPath, { 'a-450.jpg': {}, 'b-450.jpg': {} });
		await fs.writeFile(path.join(renditionsPath, 'c-450.jpg'), 'c');

		const prepared = await sweep({ previous: 'previous' });

		expect(getNames(prepared.renditions.deletions)).toStrictEqual(['c-450.jpg']);
	});

	test('a build that lands between prepare and run keeps its names', async () => {
		await writeBuild('live', 1, { renditions: ['a-450.jpg'] });
		await writeFiles(renditionsPath, { 'a-450.jpg': {} });
		await fs.writeFile(path.join(renditionsPath, 'b-450.jpg'), 'b');
		await fs.writeFile(path.join(renditionsPath, 'c-450.jpg'), 'c');

		const prepared = await sweep();

		await writeBuild('newer', 0, { renditions: ['a-450.jpg', 'b-450.jpg'] });

		const result = await prepared.run();

		expect(getNames(result.renditions.deletions)).toStrictEqual(['c-450.jpg']);
		expect(await listFiles(renditionsPath)).toStrictEqual(['a-450.jpg', 'b-450.jpg']);
		expect(await listBuildIds()).toStrictEqual(['live', 'newer']);
	});

	test('temporary files, emptied directories and records of missing files go', async () => {
		await writeBuild('live', 0, { renditions: ['kept/a-450.jpg'] });
		await writeFiles(renditionsPath, { 'gone/deep/b-450.jpg': {}, 'kept/a-450.jpg': {} });
		await fs.writeFile(path.join(renditionsPath, 'kept/a-450.jpg.tmp'), 'partial');
		await fs.rm(path.join(renditionsPath, 'gone/deep/b-450.jpg'));

		await runSweep();

		expect(await listFiles(renditionsPath)).toStrictEqual(['kept/a-450.jpg']);
		expect(existsSync(path.join(renditionsPath, 'gone'))).toBe(false);
		const records = await readFileRecords(renditionsPath);

		expect([...records.keys()]).toStrictEqual(['kept/a-450.jpg']);
	});

	test('missing directories sweep nothing and record nothing', async () => {
		await writeBuild('live', 0, { renditions: ['a-450.jpg'] });

		const result = await runSweep();

		expect(result.renditions).toMatchObject({ deletions: [], total: 0 });
		expect(result.cards).toMatchObject({ deletions: [], total: 0 });
		expect(existsSync(`${renditionsPath}-keys.json`)).toBe(false);
		expect(existsSync(`${cardsPath}-keys.json`)).toBe(false);
	});
});

describe('superseded renditions', () => {
	let digests: Record<string, string>;

	beforeEach(async () => {
		digests = {
			'kept.jpg': await writeSource('kept.jpg', '#336699'),
			'moved-new.jpg': await writeSource('moved-new.jpg', '#669933'),
			'moved-old.jpg': await writeSource('moved-old.jpg', '#993366'),
			'replaced.jpg': await writeSource('replaced.jpg', '#cc9933'),
		};
	});

	function sourceOf(sourcePath: string, digest = digests[sourcePath] ?? '') {
		return { source: { digest, path: sourcePath } };
	}

	test('go whatever the window when their source is gone, replaced or moved', async () => {
		await writeBuild('previous', 1, {
			renditions: { 'deleted-450.jpg': 'deleted.jpg', 'kept-900.jpg': 'kept.jpg' },
		});
		await writeBuild('live', 0, {
			renditions: { 'kept-450.jpg': 'kept.jpg', 'moved-450.jpg': 'moved-new.jpg' },
		});
		await writeFiles(renditionsPath, {
			'deleted-450.jpg': sourceOf('deleted.jpg', 'gone'),
			'kept-450.jpg': sourceOf('kept.jpg'),
			'kept-900.jpg': sourceOf('kept.jpg'),
			'moved-450.jpg': sourceOf('moved-new.jpg'),
			'moved-900.jpg': sourceOf('moved-old.jpg'),
			'replaced-450.jpg': sourceOf('replaced.jpg', 'earlier upload'),
		});

		const result = await runSweep({ previous: 'previous' });

		expect(getNames(result.renditions.deletions)).toStrictEqual([
			'deleted-450.jpg',
			'moved-900.jpg',
			'replaced-450.jpg',
		]);
		expect(await listFiles(renditionsPath)).toStrictEqual([
			'kept-450.jpg',
			'kept-900.jpg',
			'moved-450.jpg',
		]);
	});

	test('a rendition the live build names stays even when its record is stale', async () => {
		await writeBuild('live', 0, { renditions: { 'replaced-450.jpg': 'replaced.jpg' } });
		await writeFiles(renditionsPath, {
			'replaced-450.jpg': sourceOf('replaced.jpg', 'earlier upload'),
		});

		const prepared = await sweep();

		expect(prepared.renditions.deletions).toStrictEqual([]);
	});

	test('cards are exempt', async () => {
		await writeBuild('live', 0, { renditions: ['kept-450.jpg'] });
		await writeFiles(cardsPath, { 'page.jpg': sourceOf('deleted.jpg', 'gone') });

		const prepared = await sweep();

		expect(prepared.cards.deletions).toStrictEqual([]);
	});
});

type SourceVersion = 'v1' | 'v2';

interface ModelRecord {
	namedAgeDays?: number;
	source?: { path: string; version: 'stale' | SourceVersion };
}

interface ModelFile {
	name: string;
	record?: ModelRecord;
}

interface ModelBuild {
	ageDays: number;
	cards: Array<string>;
	renditions: Record<string, string>;
}

interface ModelStore {
	builds: Array<ModelBuild>;
	cards: Array<ModelFile>;
	renditions: Array<ModelFile>;
	sources: Array<[string, SourceVersion]>;
}

interface ModelSweep {
	live: number;
	previous?: number;
	retentionDays: { cards: number; renditions: number };
}

const modelStems = ['a', 'b', 'nested/c'];
const modelExtensions = ['jpg', 'png'];
const modelRenditions = modelStems.flatMap((stem) => [`${stem}-450.jpg`, `${stem}-900.jpg`]);
const modelCards = ['x.jpg', 'nested/y.jpg'];
const modelSources = modelStems.flatMap((stem) =>
	modelExtensions.map((extension) => `${stem}.${extension}`),
);
const sourceBytes = new Map<SourceVersion, Buffer>();

function getModelStem(name: string) {
	return name.replace(/-\d+\.jpg$/, '');
}

function getBuildId(index: number) {
	return `build-${String(index)}`;
}

// Ages sit off whole days, so no file lands exactly on a whole-day window's cutoff
const modelAgeDays = fc.constantFrom(0.5, 1.5, 3.5);

const sourceExtension = fc.constantFrom(...modelExtensions);

const modelBuild = fc.record(
	{
		cards: fc.subarray(modelCards),
		renditions: fc
			.tuple(...modelRenditions.map(() => fc.option(sourceExtension, { nil: undefined })))
			.map((extensions) =>
				Object.fromEntries(
					modelRenditions.flatMap((name, index) => {
						const extension = extensions[index];

						return extension === undefined ? [] : [[name, `${getModelStem(name)}.${extension}`]];
					}),
				),
			),
	},
	{ noNullPrototype: true },
);

// Distinct ages keep the newest build unambiguous
const modelBuilds = fc
	.uniqueArray(fc.integer({ max: 5, min: 0 }), { maxLength: 4, minLength: 1 })
	.chain((ages) =>
		fc.tuple(
			...ages.map((age) =>
				modelBuild.map((build): ModelBuild => ({ ...build, ageDays: age + 0.25 })),
			),
		),
	);

// A rendition's record names a source of the same stem, as getRenditionName derives it; convention only
function modelRecordFor(name: string, isRendition: boolean): fc.Arbitrary<ModelRecord> {
	const options = { noNullPrototype: true, requiredKeys: [] };

	if (!isRendition) return fc.record({ namedAgeDays: modelAgeDays }, options);

	const source = fc.record(
		{
			path: sourceExtension.map((extension) => `${getModelStem(name)}.${extension}`),
			version: fc.constantFrom<'stale' | SourceVersion>('stale', 'v1', 'v2'),
		},
		{ noNullPrototype: true },
	);

	return fc.record({ namedAgeDays: modelAgeDays, source }, options);
}

function modelFiles(names: ReadonlyArray<string>, isRendition: boolean) {
	return fc
		.tuple(
			...names.map((name) =>
				fc.option(
					fc
						.option(modelRecordFor(name, isRendition), { nil: undefined })
						.map((record): ModelFile => (record === undefined ? { name } : { name, record })),
					{ nil: undefined },
				),
			),
		)
		.map((files) => files.filter((file) => file !== undefined));
}

const modelSourceVersions = fc
	.tuple(
		...modelSources.map((sourcePath) =>
			fc
				.option(fc.constantFrom<SourceVersion>('v1', 'v2'), { nil: undefined })
				.map((version) =>
					version === undefined ? [] : [[sourcePath, version] as [string, SourceVersion]],
				),
		),
	)
	.map((entries) => entries.flat());

const modelStore = fc.record(
	{
		builds: modelBuilds,
		cards: modelFiles([...modelCards, 'x.jpg.tmp'], false),
		renditions: modelFiles([...modelRenditions, 'a-450.jpg.tmp'], true),
		sources: modelSourceVersions,
	},
	{ noNullPrototype: true },
);

function modelSweepFor(store: ModelStore) {
	const buildIndex = fc.integer({ max: store.builds.length - 1, min: 0 });

	return fc.record(
		{
			live: buildIndex,
			previous: buildIndex,
			retentionDays: fc.record(
				{ cards: fc.integer({ max: 3, min: 1 }), renditions: fc.integer({ max: 3, min: 1 }) },
				{ noNullPrototype: true },
			),
		},
		{ noNullPrototype: true, requiredKeys: ['live', 'retentionDays'] },
	);
}

const storeWithSweep = modelStore.chain((store) =>
	modelSweepFor(store).map((sweep) => ({ store, sweep })),
);

function getSourceDigest(version: 'stale' | SourceVersion) {
	const bytes = sourceBytes.get(version as SourceVersion);

	return bytes ? createHash('sha256').update(bytes).digest('hex') : 'an earlier upload';
}

function getAgeTime(ageDays: number) {
	return new Date(Date.now() - ageDays * dayMilliseconds);
}

async function writeModelFiles(directory: string, files: ReadonlyArray<ModelFile>) {
	await fs.rm(directory, { force: true, recursive: true });

	const records = new Map<string, FileRecord>();

	for (const { name, record } of files) {
		const filePath = path.join(directory, name);

		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, name);

		if (!record) continue;

		const stored: FileRecord = { key: name };

		if (record.namedAgeDays !== undefined) {
			stored.namedAt = getAgeTime(record.namedAgeDays).toISOString();
		}

		if (record.source) {
			stored.source = { digest: getSourceDigest(record.source.version), path: record.source.path };
		}

		records.set(name, stored);
	}

	await writeFileRecords(directory, records);
}

async function writeModelStore(store: ModelStore) {
	for (const [index, build] of store.builds.entries()) {
		await writeImageManifest(root, {
			buildId: getBuildId(index),
			cards: Object.fromEntries(build.cards.map((name) => [name, { input: { title: name } }])),
			encoding: resolveImageEncoding(),
			keepIccProfile: false,
			limitInputPixels: 268_402_689,
			mediaPath,
			renditions: build.renditions,
			version: imageManifestVersion,
		} satisfies ImageManifest);

		const writtenAt = getAgeTime(build.ageDays);

		await fs.utimes(
			path.join(root, 'manifests', `${getBuildId(index)}.json.gz`),
			writtenAt,
			writtenAt,
		);
	}

	await fs.rm(mediaPath, { force: true, recursive: true });

	for (const [sourcePath, version] of store.sources) {
		const filePath = path.join(mediaPath, sourcePath);

		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, sourceBytes.get(version) ?? '');
	}

	await writeModelFiles(renditionsPath, store.renditions);
	await writeModelFiles(cardsPath, store.cards);
}

function getNewestIndex(builds: ReadonlyArray<ModelBuild>) {
	let newest = 0;

	for (const [index, build] of builds.entries()) {
		if (build.ageDays < (builds[newest]?.ageDays ?? Infinity)) newest = index;
	}

	return newest;
}

function getKeptIndexes(store: ModelStore, sweep: ModelSweep) {
	return new Set([
		sweep.live,
		...(sweep.previous === undefined ? [] : [sweep.previous]),
		getNewestIndex(store.builds),
	]);
}

function getBuildNames(build: ModelBuild, kind: 'cards' | 'renditions') {
	return kind === 'cards' ? build.cards : Object.keys(build.renditions);
}

function isSupersededInModel(store: ModelStore, sweep: ModelSweep, file: ModelFile) {
	const live = store.builds[sweep.live];
	const source = file.record?.source;

	if (!live || !source || Object.hasOwn(live.renditions, file.name)) return false;

	const liveSource = Object.entries(live.renditions).find(
		([name]) => getModelStem(name) === getModelStem(file.name),
	)?.[1];

	if (liveSource !== undefined && liveSource !== source.path) return true;

	const current = store.sources.find(([sourcePath]) => sourcePath === source.path)?.[1];

	return current !== source.version;
}

function planInModel(store: ModelStore, sweep: ModelSweep, kind: 'cards' | 'renditions') {
	const keptIndexes = getKeptIndexes(store, sweep);
	const kept = new Set(
		store.builds
			.filter((_build, index) => keptIndexes.has(index))
			.flatMap((build) => getBuildNames(build, kind)),
	);

	return sortNames(
		store[kind]
			.filter((file) => {
				if (file.name.endsWith('.tmp')) return true;

				if (kind === 'renditions' && isSupersededInModel(store, sweep, file)) return true;

				if (kept.has(file.name)) return false;

				if (!file.record) return true;

				const ages = [
					...(file.record.namedAgeDays === undefined ? [] : [file.record.namedAgeDays]),
					...store.builds
						.filter((build) => getBuildNames(build, kind).includes(file.name))
						.map((build) => build.ageDays),
				];

				return Math.min(...ages, ...(ages.length === 0 ? [0] : [])) > sweep.retentionDays[kind];
			})
			.map((file) => file.name),
	);
}

function toSweepOptions(sweep: ModelSweep): Partial<ImageSweepOptions> {
	const options: Partial<ImageSweepOptions> = {
		live: getBuildId(sweep.live),
		retentionDays: sweep.retentionDays,
	};

	if (sweep.previous !== undefined) options.previous = getBuildId(sweep.previous);

	return options;
}

async function withModelRoot(check: () => Promise<void>) {
	root = await fs.mkdtemp(path.join(tmpdir(), 'image-sweep-model-'));
	mediaPath = path.join(root, 'media');
	renditionsPath = path.join(root, 'renditions');
	cardsPath = path.join(root, 'cards');

	try {
		await check();
	} finally {
		await fs.rm(root, { force: true, recursive: true });
	}
}

const storesAroundSweep = storeWithSweep.chain(({ store, sweep }) =>
	fc
		.record(
			{
				cards: modelFiles([...modelCards, 'x.jpg.tmp'], false),
				landed: fc.option(modelBuild, { nil: undefined }),
				renditions: modelFiles([...modelRenditions, 'a-450.jpg.tmp'], true),
				sources: modelSourceVersions,
			},
			{ noNullPrototype: true },
		)
		.map(({ landed, ...files }) => ({
			after: {
				...files,
				builds: landed ? [...store.builds, { ...landed, ageDays: 0.1 }] : store.builds,
			} satisfies ModelStore,
			before: store,
			sweep,
		})),
);

function getCreatedNames(before: ReadonlyArray<ModelFile>, after: ReadonlyArray<ModelFile>) {
	const existing = new Set(before.map((file) => file.name));

	return after.map((file) => file.name).filter((name) => !existing.has(name));
}

describe('prepareImageSweep against its documented rules', () => {
	beforeAll(async () => {
		sourceBytes.set(
			'v1',
			await sharp({ create: { background: '#336699', channels: 3, height: 8, width: 8 } })
				.jpeg()
				.toBuffer(),
		);
		sourceBytes.set(
			'v2',
			await sharp({ create: { background: '#993366', channels: 3, height: 12, width: 12 } })
				.jpeg()
				.toBuffer(),
		);
	});

	test.prop([storeWithSweep], { numRuns: 150 })(
		'plans the files the rules call for, and never one the live build names',
		async ({ store, sweep }) => {
			await withModelRoot(async () => {
				await writeModelStore(store);

				const prepared = await prepareImageSweep({
					live: getBuildId(sweep.live),
					retentionDays: sweep.retentionDays,
					storePath: root,
					...toSweepOptions(sweep),
				});
				const live = store.builds[sweep.live];
				const renditions = getNames(prepared.renditions.deletions);
				const cards = getNames(prepared.cards.deletions);

				expect(
					renditions.filter((name) => live && Object.hasOwn(live.renditions, name)),
				).toStrictEqual([]);
				expect(cards.filter((name) => live?.cards.includes(name))).toStrictEqual([]);
				expect(renditions).toStrictEqual(planInModel(store, sweep, 'renditions'));
				expect(cards).toStrictEqual(planInModel(store, sweep, 'cards'));
			});
		},
		60_000,
	);

	test.prop([storesAroundSweep], { numRuns: 150 })(
		'run removes only what prepare planned and the store still calls for',
		async ({ after, before, sweep }) => {
			await withModelRoot(async () => {
				await writeModelStore(before);

				const prepared = await prepareImageSweep({
					live: getBuildId(sweep.live),
					retentionDays: sweep.retentionDays,
					storePath: root,
					...toSweepOptions(sweep),
				});

				await writeModelStore(after);

				const result = await prepared.run();

				for (const kind of ['cards', 'renditions'] as const) {
					const planned = new Set(getNames(prepared[kind].deletions));
					const removed = planInModel(after, sweep, kind).filter((name) => planned.has(name));
					const removedNames = new Set(removed);
					const directory = kind === 'cards' ? cardsPath : renditionsPath;
					const remaining = after[kind].filter((file) => !removedNames.has(file.name));

					expect(getNames(result[kind].deletions)).toStrictEqual(removed);
					expect(await listFiles(directory)).toStrictEqual(getNames(remaining));
					expect(
						getCreatedNames(before[kind], after[kind]).filter((name) => removedNames.has(name)),
					).toStrictEqual([]);

					const records = await readFileRecords(directory);

					expect(sortNames(records.keys())).toStrictEqual(
						getNames(remaining.filter((file) => file.record !== undefined)),
					);
				}

				const keptIndexes = getKeptIndexes(after, sweep);

				expect(await listBuildIds()).toStrictEqual(
					sortNames([...keptIndexes].map((index) => getBuildId(index))),
				);
			});
		},
		60_000,
	);
});
