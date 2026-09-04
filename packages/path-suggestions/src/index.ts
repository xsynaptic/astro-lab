import { distance } from 'fastest-levenshtein';

export interface PathEntry {
	title: string;
	url: string;
}

export interface PathSuggestion extends PathEntry {
	score: number;
}

export interface PathSuggestionsOptions {
	entries: Array<PathEntry>;
	limit?: number;
	// The path the visitor asked for, normally location.pathname
	path: string;
	// Score at or above which the best candidate is redirected to instead of listed
	redirectThreshold?: number;
	// Score below which a candidate is discarded
	threshold?: number;
}

export type PathSuggestionsResult =
	{ items: Array<PathSuggestion>; type: 'list' } | { type: 'redirect'; url: string };

// Shared with the custom element, which reads its own attribute fallbacks from here
export const pathSuggestionDefaults = {
	limit: 5,
	redirectThreshold: 0.92,
	threshold: 0.5,
} as const;

// Lifts a truncated path ("/sanwan-yue" for "/sanwan-yuemei-suspension-bridge") above length-similar candidates
const substringBonus = 0.3;

/**
 * Score two strings from 0 (nothing in common) to 1 (identical)
 *
 * Edit distance relative to the longer string, plus a bonus when one contains the other
 */
export function getPathSimilarity(a: string, b: string): number {
	const longest = Math.max(a.length, b.length);

	if (longest === 0) return 1;

	const base = 1 - distance(a, b) / longest;
	const bonus = a.includes(b) || b.includes(a) ? substringBonus : 0;

	return Math.min(1, base + bonus);
}

/**
 * Rank known paths against the one requested
 *
 * Returns `undefined` when nothing clears the threshold, a redirect when the best candidate clears
 * `redirectThreshold` and is not the path already requested, and a list otherwise
 */
export function getPathSuggestions(
	options: PathSuggestionsOptions,
): PathSuggestionsResult | undefined {
	const limit = options.limit ?? pathSuggestionDefaults.limit;
	const redirectThreshold = options.redirectThreshold ?? pathSuggestionDefaults.redirectThreshold;
	const threshold = options.threshold ?? pathSuggestionDefaults.threshold;

	const current = normalizePath(options.path);

	const scored = options.entries
		.map((entry) => ({ ...entry, score: getPathSimilarity(current, normalizePath(entry.url)) }))
		// eslint-disable-next-line unicorn/no-array-sort -- toSorted needs Firefox 115; map() above already returned a fresh array
		.sort((suggestionA, suggestionB) => suggestionB.score - suggestionA.score);

	const best = scored.at(0);

	if (!best || best.score < threshold) return;

	if (best.score >= redirectThreshold && normalizePath(best.url) !== current) {
		return { type: 'redirect', url: best.url };
	}

	return {
		items: scored.filter((suggestion) => suggestion.score >= threshold).slice(0, limit),
		type: 'list',
	};
}

export function normalizePath(path: string): string {
	return path.replace(/\/+$/, '') || '/';
}
