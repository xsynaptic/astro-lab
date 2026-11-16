export interface SearchToggleSearchDetail {
	clicked: boolean;
	query: string;
	results: number;
}

interface PagefindMatch {
	matchedMetaFields?: Array<string>;
	words: Array<number>;
}

const imageMetaFields = new Set(['image', 'image_2x']);

// Pagefind searches every meta field, so the image URL alone matches gibberish and hides zero-result searches
function isTextMatch({ matchedMetaFields = [], words }: PagefindMatch) {
	return words.length > 0 || matchedMetaFields.some((field) => !imageMetaFields.has(field));
}

export function getResultCount(result: unknown) {
	if (!result || typeof result !== 'object') return;

	const { results } = result as { results?: unknown };

	if (!Array.isArray(results)) return;

	return (results as Array<PagefindMatch>).filter((match) => isTextMatch(match)).length;
}

export function createSearchSession(report: (outcome: SearchToggleSearchDetail) => void) {
	let pending: Omit<SearchToggleSearchDetail, 'clicked'> | undefined;

	function update(searchTerm: string, results: number | undefined) {
		const query = searchTerm.trim();

		if (query === '' || results === undefined) {
			pending = undefined;
			return;
		}

		pending = { query, results };
	}

	function end(isClicked: boolean) {
		if (!pending) return;

		const outcome = { clicked: isClicked, ...pending };

		pending = undefined;
		report(outcome);
	}

	return { end, update };
}

export type SearchSession = ReturnType<typeof createSearchSession>;
