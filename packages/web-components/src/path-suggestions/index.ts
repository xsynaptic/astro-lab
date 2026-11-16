import { PathSuggestionsElement, pathSuggestionsElementName } from './element.js';

export function definePathSuggestions() {
	if (customElements.get(pathSuggestionsElementName)) return;

	customElements.define(pathSuggestionsElementName, PathSuggestionsElement);
}

export type { PathSuggestionsDoneDetail, PathSuggestionsRedirectDetail } from './element.js';
export {
	pathSuggestionsDoneEvent,
	PathSuggestionsElement,
	pathSuggestionsRedirectEvent,
} from './element.js';
export type {
	PathEntry,
	PathSuggestion,
	PathSuggestionsOptions,
	PathSuggestionsResult,
} from './score.js';
export {
	getPathSimilarity,
	getPathSuggestions,
	normalizePath,
	pathSuggestionDefaults,
} from './score.js';
