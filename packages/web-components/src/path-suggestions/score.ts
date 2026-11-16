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
	path: string;
	redirectThreshold?: number;
	threshold?: number;
}

export type PathSuggestionsResult =
	{ items: Array<PathSuggestion>; type: 'list' } | { type: 'redirect'; url: string };

export const pathSuggestionDefaults = {
	limit: 5,
	redirectThreshold: 0.92,
	threshold: 0.5,
} as const;

const substringBonus = 0.3;

export function getPathSimilarity(a: string, b: string): number {
	const longest = Math.max(a.length, b.length);

	if (longest === 0) return 1;

	const base = 1 - distance(a, b) / longest;
	const bonus = a.includes(b) || b.includes(a) ? substringBonus : 0;

	return Math.min(1, base + bonus);
}

export function getPathSuggestions(
	options: PathSuggestionsOptions,
): PathSuggestionsResult | undefined {
	const limit = options.limit ?? pathSuggestionDefaults.limit;
	const redirectThreshold = options.redirectThreshold ?? pathSuggestionDefaults.redirectThreshold;
	const threshold = options.threshold ?? pathSuggestionDefaults.threshold;

	const current = normalizePath(options.path);

	const scored = options.entries
		.map((entry) => ({ ...entry, score: getPathSimilarity(current, normalizePath(entry.url)) }))
		.sort((suggestionA, suggestionB) => suggestionB.score - suggestionA.score);

	const best = scored.at(0);

	if (!best || best.score < threshold) return;

	const bestPath = normalizePath(best.url);

	const runnerUp = scored.find((suggestion) => normalizePath(suggestion.url) !== bestPath);
	const isClearWinner = runnerUp === undefined || runnerUp.score < best.score;

	if (isClearWinner && bestPath !== current && best.score >= redirectThreshold) {
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
