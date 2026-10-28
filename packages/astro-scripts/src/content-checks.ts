import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { ContentEntry } from './astro.js';
import type { EntryReference, ReferenceIssue, ValidationIssue } from './validation.js';

import { toReferenceValidationResult, toValidationResult } from './validation.js';

export interface ComponentTag {
	lineNumber: number;
	name: string;
	props: string;
}

interface CheckReferencesOptions {
	skipCollections?: ReadonlyArray<string>;
}

interface CheckEntryIdsOptions {
	getIds?: (entry: ContentEntry) => ReadonlyArray<string>;
}

interface CheckComponentPropsOptions {
	required: Readonly<Record<string, string>>;
	rootPath: string;
}

interface CheckComponentTargetsOptions {
	component: string;
	prop: string;
	rootPath: string;
	targets: Iterable<string>;
}

interface LocatedTag {
	context: string;
	location: string;
	tag: ComponentTag;
}

const componentTagPattern = /<([A-Z]\w*)((?:\s[^>]*?)?)\/?>/g;

function getLocation(entry: Pick<ContentEntry, 'filePath' | 'id'>) {
	return entry.filePath ?? entry.id;
}

export function findComponentTags(body: string, names: ReadonlyArray<string>) {
	const tags: Array<ComponentTag> = [];

	for (const match of body.matchAll(componentTagPattern)) {
		const name = match[1];

		if (!name || !names.includes(name)) continue;

		tags.push({
			lineNumber: body.slice(0, match.index).split('\n').length,
			name,
			props: match[2] ?? '',
		});
	}

	return tags;
}

export function getTagProp({ props }: ComponentTag, name: string) {
	return new RegExp(String.raw`(?:^|\s)${name}=["']([^"']+)["']`).exec(props)?.[1];
}

export function getBodyLineOffset(entry: ContentEntry, rootPath: string) {
	if (!entry.filePath || !entry.body) return 0;

	let source: string;

	try {
		source = readFileSync(path.join(rootPath, entry.filePath), 'utf8');
	} catch {
		return 0;
	}

	const bodyIndex = source.indexOf(entry.body);

	if (bodyIndex === -1) return 0;

	return source.slice(0, bodyIndex).split('\n').length - 1;
}

function findLocatedTags(
	entries: ReadonlyArray<ContentEntry>,
	names: ReadonlyArray<string>,
	rootPath: string,
) {
	return entries.flatMap((entry): Array<LocatedTag> => {
		if (!entry.body) return [];

		const tags = findComponentTags(entry.body, names);

		if (tags.length === 0) return [];

		const lines = entry.body.split('\n');
		const lineOffset = getBodyLineOffset(entry, rootPath);
		const location = getLocation(entry);

		return tags.map((tag) => ({
			context: lines[tag.lineNumber - 1]?.trim() ?? '',
			location: `${location}:${String(tag.lineNumber + lineOffset)}`,
			tag,
		}));
	});
}

function toEntryReference(record: Record<string, unknown>, field: string) {
	if (typeof record.collection !== 'string' || typeof record.id !== 'string') return;

	return { collection: record.collection, field, id: record.id } satisfies EntryReference;
}

function collectEntryReferences(value: unknown, field: string, references: Array<EntryReference>) {
	if (value === null || typeof value !== 'object') return;

	if (Array.isArray(value)) {
		for (const [index, item] of (value as Array<unknown>).entries()) {
			collectEntryReferences(item, `${field}[${String(index)}]`, references);
		}
		return;
	}

	const record = value as Record<string, unknown>;
	const reference = toEntryReference(record, field);

	if (reference) {
		references.push(reference);
		return;
	}

	for (const [key, item] of Object.entries(record)) {
		collectEntryReferences(item, field ? `${field}.${key}` : key, references);
	}
}

function getIdsByCollection(entries: ReadonlyArray<ContentEntry>) {
	const idsByCollection = new Map<string, Set<string>>();

	for (const entry of entries) {
		const ids = idsByCollection.get(entry.collection) ?? new Set<string>();

		ids.add(entry.id);
		idsByCollection.set(entry.collection, ids);
	}

	return idsByCollection;
}

export function checkReferences(
	entries: ReadonlyArray<ContentEntry>,
	{ skipCollections = [] }: CheckReferencesOptions = {},
) {
	const idsByCollection = getIdsByCollection(entries);
	const skipped = new Set(skipCollections);
	const issues = entries.flatMap((entry) => {
		const references: Array<EntryReference> = [];

		collectEntryReferences(entry.data, '', references);

		return references
			.filter(
				({ collection, id }) =>
					!skipped.has(collection) && !idsByCollection.get(collection)?.has(id),
			)
			.map((reference): ReferenceIssue => ({ ...reference, location: getLocation(entry) }));
	});

	return toReferenceValidationResult(issues, {
		fail: `Found ${String(issues.length)} broken reference(s)`,
		pass: 'Entry references valid',
	});
}

export function checkEntryIds(
	entries: ReadonlyArray<ContentEntry>,
	{ getIds = (entry) => [entry.id] }: CheckEntryIdsOptions = {},
) {
	const locationsById = new Map<string, Array<string>>();

	for (const entry of entries) {
		const ids = new Set(getIds(entry));

		for (const id of ids) {
			const locations = locationsById.get(id) ?? [];

			locations.push(getLocation(entry));
			locationsById.set(id, locations);
		}
	}

	const duplicates = [...locationsById].filter(([, locations]) => locations.length > 1);

	return toValidationResult(
		duplicates.flatMap(([id, locations]) =>
			locations.map((location) => ({ location, message: `duplicate entry ID "${id}"` })),
		),
		{
			fail: `Found ${String(duplicates.length)} duplicate entry ID(s)`,
			pass: `${String(entries.length)} entry IDs unique`,
		},
	);
}

export function checkComponentProps(
	entries: ReadonlyArray<ContentEntry>,
	{ required, rootPath }: CheckComponentPropsOptions,
) {
	const issues = findLocatedTags(entries, Object.keys(required), rootPath).flatMap(
		({ context, location, tag }): Array<ValidationIssue> => {
			const prop = required[tag.name];

			if (prop === undefined || getTagProp(tag, prop) !== undefined) return [];

			return [
				{ details: [context], location, message: `${tag.name} component missing ${prop} prop` },
			];
		},
	);

	return toValidationResult(issues, {
		fail: `Found ${String(issues.length)} invalid component(s)`,
		pass: 'MDX components valid',
	});
}

export function checkComponentTargets(
	entries: ReadonlyArray<ContentEntry>,
	{ component, prop, rootPath, targets }: CheckComponentTargetsOptions,
) {
	const validTargets = new Set(targets);
	const issues = findLocatedTags(entries, [component], rootPath).flatMap(
		({ location, tag }): Array<ValidationIssue> => {
			const value = getTagProp(tag, prop);

			if (value === undefined || validTargets.has(value)) return [];

			return [{ location, message: `broken ${component} ${prop} "${value}"` }];
		},
	);

	return toValidationResult(issues, {
		fail: `Found ${String(issues.length)} broken ${component} ${prop}(s)`,
		pass: `${component} ${prop}s valid`,
	});
}
