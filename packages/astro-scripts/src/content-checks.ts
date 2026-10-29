import type * as SatteriModule from 'satteri';
import type { MdastNode, MdxJsxAttributeUnion } from 'satteri';

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { ContentEntry } from './astro.js';
import type { EntryReference, ReferenceIssue, ValidationIssue } from './validation.js';

import { formatError } from './output/format.js';
import { UserError } from './user-error.js';
import { toReferenceValidationResult, toValidationResult } from './validation.js';

export type ComponentProp =
	| { kind: 'expression'; name: string }
	| { kind: 'flag'; name: string }
	| { kind: 'literal'; name: string; value: string };

export interface ComponentTag {
	lineNumber: number;
	name: string;
	props: ReadonlyArray<ComponentProp>;
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
	label?: string;
	prop: string;
	rootPath: string;
	targets: Iterable<string>;
}

interface LocatedTag {
	context: string;
	location: string;
	tag: ComponentTag;
}

interface LocatedTags {
	issues: Array<ValidationIssue>;
	tags: Array<LocatedTag>;
}

let satteri: typeof SatteriModule | undefined;

function loadSatteri() {
	if (satteri) return satteri;

	try {
		satteri = createRequire(import.meta.url)('satteri') as typeof SatteriModule;
	} catch (error) {
		throw new UserError(
			'MDX component checks need the `satteri` package; add it to the scripts package at the version the site renders with',
			{ cause: error },
		);
	}

	return satteri;
}

function getLocation(entry: Pick<ContentEntry, 'filePath' | 'id'>) {
	return entry.filePath ?? entry.id;
}

function toComponentProp(attribute: MdxJsxAttributeUnion): ComponentProp | undefined {
	if (attribute.type === 'mdxJsxExpressionAttribute') return;

	const { name, value } = attribute;

	if (typeof value === 'string') return { kind: 'literal', name, value };

	if (value) return { kind: 'expression', name };

	return { kind: 'flag', name };
}

function collectComponentTags(
	node: MdastNode,
	names: ReadonlyArray<string>,
	tags: Array<ComponentTag>,
) {
	const isComponent = node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement';

	if (isComponent && node.name && names.includes(node.name) && node.position) {
		tags.push({
			lineNumber: node.position.start.line,
			name: node.name,
			props: node.attributes.flatMap((attribute) => toComponentProp(attribute) ?? []),
		});
	}

	if (!('children' in node)) return;

	for (const child of node.children as ReadonlyArray<MdastNode>) {
		collectComponentTags(child, names, tags);
	}
}

export function findComponentTags(body: string, names: ReadonlyArray<string>) {
	const tags: Array<ComponentTag> = [];

	collectComponentTags(loadSatteri().mdxToMdast(body), names, tags);

	return tags;
}

export function getTagProp({ props }: ComponentTag, name: string) {
	for (const prop of props) {
		if (prop.name === name && prop.kind === 'literal') return prop.value;
	}

	return;
}

function hasTagProp({ props }: ComponentTag, name: string) {
	return props.some((prop) => prop.name === name && prop.kind !== 'flag');
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
	const located: LocatedTags = { issues: [], tags: [] };

	for (const entry of entries) {
		if (!entry.body) continue;

		const location = getLocation(entry);
		let tags: Array<ComponentTag>;

		try {
			tags = findComponentTags(entry.body, names);
		} catch (error) {
			if (error instanceof UserError) throw error;

			located.issues.push({ location, message: `MDX failed to parse: ${formatError(error)}` });
			continue;
		}

		if (tags.length === 0) continue;

		const lines = entry.body.split('\n');
		const lineOffset = getBodyLineOffset(entry, rootPath);

		for (const tag of tags) {
			located.tags.push({
				context: lines[tag.lineNumber - 1]?.trim() ?? '',
				location: `${location}:${String(tag.lineNumber + lineOffset)}`,
				tag,
			});
		}
	}

	return located;
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
	const { issues: parseIssues, tags } = findLocatedTags(entries, Object.keys(required), rootPath);
	const issues = [
		...parseIssues,
		...tags.flatMap(({ context, location, tag }): Array<ValidationIssue> => {
			const prop = required[tag.name];

			if (prop === undefined || hasTagProp(tag, prop)) return [];

			return [
				{ details: [context], location, message: `${tag.name} component missing ${prop} prop` },
			];
		}),
	];

	return toValidationResult(issues, {
		fail: `Found ${String(issues.length)} invalid component(s)`,
		pass: 'MDX components valid',
	});
}

export function checkComponentTargets(
	entries: ReadonlyArray<ContentEntry>,
	{
		component,
		prop,
		label = `${component} ${prop}`,
		rootPath,
		targets,
	}: CheckComponentTargetsOptions,
) {
	const validTargets = new Set(targets);
	const { issues: parseIssues, tags } = findLocatedTags(entries, [component], rootPath);
	const issues = [
		...parseIssues,
		...tags.flatMap(({ location, tag }): Array<ValidationIssue> => {
			const value = getTagProp(tag, prop);

			if (value === undefined || validTargets.has(value)) return [];

			return [{ location, message: `broken ${label} "${value}"` }];
		}),
	];

	return toValidationResult(issues, {
		fail: `Found ${String(issues.length)} broken ${label}(s)`,
		pass: `${label}s valid`,
	});
}
