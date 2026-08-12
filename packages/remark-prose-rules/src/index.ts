import type { Root, Text } from 'mdast';
import type { Plugin } from 'unified';
import type { Location } from 'vfile-location';

import { matchCasing } from 'match-casing';
import { visitParents } from 'unist-util-visit-parents';
import { location } from 'vfile-location';
import { z } from 'zod';

import { diacriticsWords } from './words.js';

declare module 'unified' {
	interface Data {
		editorialFixes?: boolean;
	}
}

const optionsSchema = z.object({
	patterns: z
		.array(z.object({ message: z.string(), pattern: z.string(), replace: z.string() }))
		.default([]),
	skip: z.array(z.string()).default(['blockquote']),
	terms: z.array(z.tuple([z.string(), z.string()])).default([]),
	words: z.array(z.string()).default([]),
});

// Each group ends with the plain letter; the leading characters are marks that may stand in for it
const markGroups = ["’'", 'àâäåa', 'éèêëe', 'çc', 'îíi', 'ñn', 'öo', 'šs', 'ûüu', 'ÿy'];

const punctuation = String.raw`[\.,;:!?'"’”)]`;

const sentenceStart = /\w+[!.?]\)? $/;

interface CompiledRule {
	// Editorial rules report but only rewrite under the fix flag
	isEditorial: boolean;
	matcher: RegExp;
	reason: (value: string, replacement: string) => string;
	resolve: (match: RegExpExecArray, text: string) => string | undefined;
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

export function remarkProseRules(options?: RemarkProseRulesOptions): Plugin<[], Root> {
	const settings = optionsSchema.parse(options ?? {});
	const rules = compileRules(settings);
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
						place: toPlace(node, match, place, source),
						ruleId: 'prose-rules',
						source: 'remark-prose-rules',
					});

					message.actual = match.value;
					message.expected = [match.replacement];
				}

				// Rewriting last keeps node.position describing the string the matches were found in
				node.value = applyReplacements(node.value, matches);
			});
		};
	};
}

function applyReplacements(text: string, matches: ReadonlyArray<ProseMatch>) {
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
function compileRules(settings: z.output<typeof optionsSchema>): Array<CompiledRule> {
	const words = [...diacriticsWords, ...settings.words];
	const corrections = words.map((word) => ({
		pattern: new RegExp(String.raw`\b${getPattern(word)}\b`, 'i'),
		word,
	}));

	return [
		{
			isEditorial: false,
			matcher: new RegExp(String.raw`\b(?:${words.map(getPattern).join('|')})\b`, 'ig'),
			reason: (value, replacement) =>
				`Incorrect usage of the word: “${value}”, use “${replacement}” instead`,
			resolve: (match) => getCorrection(corrections, match[0]),
		},
		...settings.terms.map(([pattern, replacement]) => {
			const matcher = new RegExp(pattern, 'i');

			return {
				isEditorial: true,
				matcher: new RegExp(guardBoundaries(pattern), 'igm'),
				reason: (value: string, next: string) =>
					`Incorrect term: “${value.trim()}”, use “${next.trim()}” instead`,
				resolve: (match: RegExpExecArray, text: string) =>
					resolveTerm(matcher, replacement, match, text),
			};
		}),
		...settings.patterns.map((pattern) => {
			const matcher = new RegExp(pattern.pattern, '');

			return {
				isEditorial: false,
				matcher: new RegExp(pattern.pattern, 'g'),
				reason: () => pattern.message,
				resolve: (match: RegExpExecArray) => substitute(match[0], matcher, pattern.replace),
			};
		}),
	];
}

// The alternation regex reports that a word matched, not which one
function getCorrection(
	corrections: ReadonlyArray<{ pattern: RegExp; word: string }>,
	value: string,
) {
	for (const correction of corrections) {
		if (!correction.pattern.test(value)) continue;

		return matchCasing(
			value.replace(correction.pattern, () => correction.word),
			value,
		);
	}
	return;
}

// Turn each diacritic into a class matching that letter with or without its mark: décor → d[éèêëe]cor
function getPattern(word: string) {
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

// Text-node offsets track source offsets only where the span has no escapes or character references
// Falling back to the node keeps a shifted range from corrupting a quickfix
function toPlace(node: Text, match: ProseMatch, place: Location, source: string) {
	const base = node.position?.start.offset;

	if (base === undefined) return node.position;

	const start = base + match.start;
	const end = base + match.end;

	if (source.slice(start, end) !== match.value) return node.position;

	const startPoint = place.toPoint(start);
	const endPoint = place.toPoint(end);

	if (!startPoint || !endPoint) return node.position;

	return { end: endPoint, start: startPoint };
}

function upperFirst(text: string) {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

export type { RemarkProseRulesOptions };
