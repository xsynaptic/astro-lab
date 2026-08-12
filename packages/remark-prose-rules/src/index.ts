import type { Root, Yaml } from 'mdast';
import type { Plugin } from 'unified';
import type { Location } from 'vfile-location';
import type { Scalar } from 'yaml';

import { visitParents } from 'unist-util-visit-parents';
import { location } from 'vfile-location';
import { isMap, isScalar, isSeq, parseDocument } from 'yaml';
import { z } from 'zod';

import { diacriticsMarks } from './words.js';

declare module 'unified' {
	interface Data {
		editorialFixes?: boolean;
	}
}

const patternsSchema = z.array(
	z.object({ message: z.string(), pattern: z.string(), replace: z.string() }),
);

const termsSchema = z.array(z.tuple([z.string(), z.string()]));

const wordsSchema = z.array(z.string());

const fieldSchema = z.object({
	patterns: z.union([z.boolean(), patternsSchema]).optional(),
	terms: z.union([z.boolean(), termsSchema]).optional(),
	words: z.union([z.boolean(), wordsSchema]).optional(),
});

const optionsSchema = z.object({
	frontmatter: z.record(z.string(), fieldSchema).default({}),
	marks: z.array(z.string()).default(diacriticsMarks),
	patterns: patternsSchema.default([]),
	skip: z.array(z.string()).default(['blockquote']),
	terms: termsSchema.default([]),
	words: wordsSchema.default([]),
});

const punctuation = String.raw`[\.,;:!?'"’”)]`;

const sentenceStart = /\w+[!.?]\)? $/;

interface CompiledBuckets {
	patterns: Array<CompiledRule>;
	terms: Array<CompiledRule>;
	words: Array<CompiledRule>;
}

interface CompiledField {
	rules: Array<CompiledRule>;
	segments: Array<string>;
}

interface CompiledRule {
	// Editorial rules report but only rewrite under the fix flag
	isEditorial: boolean;
	matcher: RegExp;
	reason: (value: string, replacement: string) => string;
	resolve: (match: RegExpExecArray, text: string) => string | undefined;
}

interface FrontmatterResult {
	bodyOffset: number;
	canFix: boolean;
	matches: Array<ProseMatch>;
	value: string;
}

interface ProseMatch {
	end: number;
	isFixable: boolean;
	reason: string;
	replacement: string;
	start: number;
	value: string;
}

type RemarkProseRulesOptions = z.input<typeof optionsSchema>;

type Replacement = Pick<ProseMatch, 'end' | 'isFixable' | 'replacement' | 'start'>;

interface ScalarResult {
	fix: Replacement | undefined;
	matches: Array<ProseMatch>;
}

export function remarkProseRules(options?: RemarkProseRulesOptions): Plugin<[], Root> {
	const settings = optionsSchema.parse(options ?? {});
	const buckets = compileBuckets(settings, settings.marks);
	const rules = orderRules(buckets);
	const fields = compileFields(settings, buckets);
	const skip = new Set(settings.skip);

	return function () {
		// Set by a batch fix run; unset on format-on-save, so terminology stays quickfix-only there
		// eslint-disable-next-line unicorn/no-this-outside-of-class -- `this` is the processor in a unified attacher
		const shouldFix = this.data('editorialFixes') === true;

		return function (tree, file) {
			const source = String(file.value);
			const place = location(file);

			visitParents(tree, 'text', (node, ancestors) => {
				if (ancestors.some((ancestor) => skip.has(ancestor.type))) return;

				const matches = resolveOverlaps(
					rules.flatMap((rule) => collect(node.value, rule, shouldFix)),
				);

				for (const match of matches) {
					const message = file.message(match.reason, {
						ancestors: [...ancestors, node],
						place: toPlace(node.position?.start.offset, match, place, source) ?? node.position,
						ruleId: 'prose-rules',
						source: 'remark-prose-rules',
					});

					message.actual = match.value;
					message.expected = [match.replacement];
				}

				// Rewriting last keeps node.position describing the string the matches were found in
				node.value = applyReplacements(node.value, matches);
			});

			if (fields.length === 0) return;

			visitParents(tree, 'yaml', (node, ancestors) => {
				const result = lintFrontmatter(node, fields, shouldFix, source);

				if (!result) return;

				for (const match of result.matches) {
					const position = toPlace(result.bodyOffset, match, place, source);

					const message = file.message(match.reason, {
						ancestors: [...ancestors, node],
						place: position ?? node.position,
						ruleId: 'prose-rules',
						source: 'remark-prose-rules',
					});

					message.actual = match.value;

					// Without a verified span a quickfix would rewrite the whole block
					if (position && result.canFix) message.expected = [match.replacement];
				}

				node.value = result.value;
			});
		};
	};
}

// Each derived pattern maps one character to one character, so the match and the word align by index
// Transferring case per position keeps multi-word title case, which a whole-string check cannot
function applyCasing(value: string, corrected: string) {
	let result = '';
	let index = 0;

	for (const char of corrected) {
		const original = value.charAt(index);

		result += original === original.toLowerCase() ? char : char.toUpperCase();
		index += char.length;
	}

	return result;
}

function applyReplacements(text: string, matches: ReadonlyArray<Replacement>) {
	let result = '';
	let cursor = 0;

	for (const match of matches) {
		if (!match.isFixable) continue;

		result += text.slice(cursor, match.start) + match.replacement;
		cursor = match.end;
	}

	return result + text.slice(cursor);
}

function collect(text: string, rule: CompiledRule, shouldFix: boolean) {
	const matches: Array<ProseMatch> = [];

	rule.matcher.lastIndex = 0;

	let match: null | RegExpExecArray;

	while ((match = rule.matcher.exec(text))) {
		const value = match[0];
		const replacement = rule.resolve(match, text);

		if (replacement === undefined || replacement === value) continue;

		matches.push({
			end: match.index + value.length,
			isFixable: shouldFix || !rule.isEditorial,
			reason: rule.reason(value, replacement),
			replacement,
			start: match.index,
			value,
		});
	}

	return matches;
}

// Compiling once here rather than per node is most of the speed win over the textlint rules
function compileBuckets(
	source: Pick<z.output<typeof optionsSchema>, 'patterns' | 'terms' | 'words'>,
	marks: ReadonlyArray<string>,
): CompiledBuckets {
	return {
		patterns: compilePatterns(source.patterns),
		terms: compileTerms(source.terms),
		words: compileWords(source.words, marks),
	};
}

function compileFields(
	settings: z.output<typeof optionsSchema>,
	buckets: CompiledBuckets,
): Array<CompiledField> {
	return Object.entries(settings.frontmatter)
		.map(([path, field]) => ({
			rules: orderRules({
				patterns: resolveBucket(field.patterns, buckets.patterns, compilePatterns),
				terms: resolveBucket(field.terms, buckets.terms, compileTerms),
				words: resolveBucket(field.words, buckets.words, (words) =>
					compileWords(words, settings.marks),
				),
			}),
			segments: path.split('.'),
		}))
		.filter((field) => field.rules.length > 0);
}

function compilePatterns(patterns: z.output<typeof patternsSchema>): Array<CompiledRule> {
	return patterns.map((pattern) => {
		const matcher = new RegExp(pattern.pattern, '');

		return {
			isEditorial: false,
			matcher: new RegExp(pattern.pattern, 'g'),
			reason: () => pattern.message,
			resolve: (match: RegExpExecArray) => substitute(match[0], matcher, pattern.replace),
		};
	});
}

function compileTerms(terms: z.output<typeof termsSchema>): Array<CompiledRule> {
	return terms.map(([pattern, replacement]) => {
		const matcher = new RegExp(pattern, 'i');

		return {
			isEditorial: true,
			matcher: new RegExp(guardBoundaries(pattern), 'igm'),
			reason: (value: string, next: string) =>
				`Incorrect term: “${value.trim()}”, use “${next.trim()}” instead`,
			resolve: (match: RegExpExecArray, text: string) =>
				resolveTerm(matcher, replacement, match, text),
		};
	});
}

function compileWords(
	words: z.output<typeof wordsSchema>,
	marks: ReadonlyArray<string>,
): Array<CompiledRule> {
	// An empty list would compile to `\b(?:)\b`, which matches endlessly at every word boundary
	if (words.length === 0) return [];

	const corrections = words.map((word) => {
		const source = getPattern(word, marks);

		return { pattern: new RegExp(String.raw`\b${source}\b`, 'i'), source, word };
	});

	return [
		{
			isEditorial: false,
			matcher: new RegExp(
				String.raw`\b(?:${corrections.map((correction) => correction.source).join('|')})\b`,
				'ig',
			),
			reason: (value: string, replacement: string) =>
				`Incorrect usage of the word: “${value}”, use “${replacement}” instead`,
			resolve: (match: RegExpExecArray) => getCorrection(corrections, match[0]),
		},
	];
}

// The alternation regex reports that a word matched, not which one
function getCorrection(
	corrections: ReadonlyArray<{ pattern: RegExp; word: string }>,
	value: string,
) {
	for (const correction of corrections) {
		if (!correction.pattern.test(value)) continue;

		return applyCasing(
			value,
			value.replace(correction.pattern, () => correction.word),
		);
	}
	return;
}

// Turn each diacritic into a class matching that letter with or without its mark: décor → d[éèêëe]cor
function getPattern(word: string, markGroups: ReadonlyArray<string>) {
	let pattern = '';

	for (const char of word) {
		const group = markGroups.find((marks) =>
			marks.slice(0, -1).toLowerCase().includes(char.toLowerCase()),
		);

		pattern += group ? `[${group}]` : char;
	}

	return pattern;
}

// Leading boundary rejects a hyphen, word character, or dot; the dot skips file extensions
// Trailing boundary wants a space, punctuation, or end of string
// A pattern carrying its own lookarounds is left alone
function guardBoundaries(pattern: string) {
	if (pattern.startsWith('(?<') || pattern.includes('(?=') || pattern.includes('(?!')) {
		return pattern;
	}
	return String.raw`(?<=^|[^-\w])(?<!\.)\b${pattern}\b(?= |${punctuation} |${punctuation}${punctuation}|${punctuation}$|$)`;
}

// Splicing the body keeps the original styling; reserializing would restyle every file
function lintFrontmatter(
	node: Yaml,
	fields: ReadonlyArray<CompiledField>,
	shouldFix: boolean,
	source: string,
): FrontmatterResult | undefined {
	const start = node.position?.start.offset;

	if (start === undefined) return;

	const bodyOffset = source.indexOf('\n', start) + 1;

	if (bodyOffset === 0 || source.slice(bodyOffset, bodyOffset + node.value.length) !== node.value) {
		return;
	}

	const document = parseDocument(node.value);

	const results = fields
		.flatMap((field) =>
			resolveScalars(document.contents, field.segments).map((scalar) =>
				lintScalar(scalar, field.rules, node.value, shouldFix),
			),
		)
		.filter((result) => result !== undefined);

	const matches = results.flatMap((result) => result.matches);
	const fixes = results.map((result) => result.fix).filter((fix) => fix !== undefined);

	if (fixes.length === 0) return { bodyOffset, canFix: true, matches, value: node.value };

	fixes.sort((a, b) => a.start - b.start);

	const value = applyReplacements(node.value, fixes);
	const reparsed = parseDocument(value);

	// A replacement carrying YAML syntax would restructure the block rather than correct a word
	const canFix =
		reparsed.errors.length === 0 &&
		JSON.stringify(reparsed.toJSON()) === JSON.stringify(document.toJSON());

	return { bodyOffset, canFix, matches, value: canFix ? value : node.value };
}

// Updates the parsed scalar too, so the document carries the intended result for the reparse check
function lintScalar(
	scalar: Scalar,
	rules: ReadonlyArray<CompiledRule>,
	body: string,
	shouldFix: boolean,
): ScalarResult | undefined {
	const value = scalar.value;

	if (typeof value !== 'string' || !scalar.range) return;

	const [start, valueEnd] = scalar.range;

	// A quoted scalar carries quotes and escapes, so its offsets no longer track the source
	const isPlain = body.slice(start, valueEnd) === value;

	const matches = resolveOverlaps(rules.flatMap((rule) => collect(value, rule, shouldFix))).map(
		(match) => ({ ...match, isFixable: match.isFixable && isPlain }),
	);

	if (matches.length === 0) return;

	const next = applyReplacements(value, matches);
	const isChanged = isPlain && next !== value;

	if (isChanged) scalar.value = next;

	return {
		fix: isChanged ? { end: valueEnd, isFixable: true, replacement: next, start } : undefined,
		matches: matches.map((match) => ({
			...match,
			end: start + match.end,
			start: start + match.start,
		})),
	};
}

function orderRules(buckets: CompiledBuckets) {
	// Words stay first so an identical span beats a term on the stable sort in `resolveOverlaps`
	return [...buckets.words, ...buckets.terms, ...buckets.patterns];
}

function resolveBucket<Value>(
	field: Array<Value> | boolean | undefined,
	inherited: Array<CompiledRule>,
	compile: (values: Array<Value>) => Array<CompiledRule>,
) {
	if (field === undefined || field === false) return [];
	if (field === true) return inherited;

	return compile(field);
}

// Rules match independently, so two can land on the same span
// The earlier and longer match wins; the rest are dropped rather than spliced over each other
function resolveOverlaps(matches: Array<ProseMatch>) {
	matches.sort((a, b) => a.start - b.start || b.end - a.end);

	const resolved: Array<ProseMatch> = [];

	let cursor = 0;

	for (const match of matches) {
		if (match.start < cursor) continue;

		resolved.push(match);
		cursor = match.end;
	}

	return resolved;
}

// A `[]` segment forks the walk, so every item continues down the remaining path
function resolveScalars(node: unknown, segments: ReadonlyArray<string>): Array<Scalar> {
	let current = node;

	for (const [index, segment] of segments.entries()) {
		if (!isMap(current)) return [];

		const isSequence = segment.endsWith('[]');
		const value = current.get(isSequence ? segment.slice(0, -2) : segment, true);

		if (!isSequence) {
			current = value;
			continue;
		}

		if (!isSeq(value)) return [];

		const rest = segments.slice(index + 1);

		return value.items.flatMap((item) => resolveScalars(item, rest));
	}

	return isScalar(current) ? [current] : [];
}

function resolveTerm(
	matcher: RegExp,
	replacement: string,
	match: RegExpExecArray,
	text: string,
): string {
	const value = match[0];
	const tag = 'xyz';

	// textlint pads the match so a bare pattern can still resolve $n captures; ported as-is
	const padded = substitute(`${tag} ${value} ${tag}`, matcher, replacement);
	const next = padded.slice(tag.length + 1, -(tag.length + 1));

	const isSentenceStart = match.index === 0 || sentenceStart.test(text.slice(0, match.index));

	return isSentenceStart && upperFirst(value) === value ? upperFirst(next) : next;
}

function substitute(value: string, matcher: RegExp, replacement: string) {
	// eslint-disable-next-line unicorn/no-unsafe-string-replacement -- $n captures are the point
	return value.replace(matcher, replacement);
}

// Node offsets track source offsets only where the span has no escapes or character references
// Returning nothing leaves the caller to fall back rather than emit a shifted range
function toPlace(base: number | undefined, match: ProseMatch, place: Location, source: string) {
	if (base === undefined) return;

	const start = base + match.start;
	const end = base + match.end;

	if (source.slice(start, end) !== match.value) return;

	const startPoint = place.toPoint(start);
	const endPoint = place.toPoint(end);

	if (!startPoint || !endPoint) return;

	return { end: endPoint, start: startPoint };
}

function upperFirst(text: string) {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

export { diacriticsMarks, diacriticsWords } from './words.js';

export type { RemarkProseRulesOptions };
