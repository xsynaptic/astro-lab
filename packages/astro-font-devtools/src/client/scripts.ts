import type { CatalogFont } from '../shared/types.js';

// Display names for common base scripts
// toBaseScripts folds `-ext`/auxiliary subsets away before labeling, so only base names appear here
// Anything unlisted falls back to a title-cased raw name.
const scriptLabels: Record<string, string> = {
	arabic: 'Arabic',
	armenian: 'Armenian',
	bengali: 'Bengali',
	cherokee: 'Cherokee',
	'chinese-hongkong': 'Chinese (Hong Kong)',
	'chinese-simplified': 'Chinese (Simplified)',
	'chinese-traditional': 'Chinese (Traditional)',
	cyrillic: 'Cyrillic',
	devanagari: 'Devanagari',
	ethiopic: 'Ethiopic',
	georgian: 'Georgian',
	greek: 'Greek',
	gujarati: 'Gujarati',
	gurmukhi: 'Gurmukhi',
	hebrew: 'Hebrew',
	japanese: 'Japanese',
	kannada: 'Kannada',
	khmer: 'Khmer',
	korean: 'Korean',
	latin: 'Latin',
	malayalam: 'Malayalam',
	myanmar: 'Myanmar',
	sinhala: 'Sinhala',
	tamil: 'Tamil',
	telugu: 'Telugu',
	thai: 'Thai',
};

export function scriptLabel(script: string): string {
	return scriptLabels[script] ?? toTitleCase(script);
}

// Non-script subsets (glyph sets, not writing systems), dropped from base scripts entirely.
const auxiliarySubsets = new Set(['braille', 'emoji', 'math', 'menu', 'symbols']);

// Scripts carried by fewer than this many families are dropped from the picker as long-tail noise
// Lower it to surface rarer writing systems
const scriptThreshold = 5;

// The script vocabulary, derived from the catalog (base scripts) and ordered by how many families carry each
// Most common first, so `latin` leads; the data is the source of truth; no enum
export function sortedScripts(fonts: Array<CatalogFont>): Array<string> {
	const counts = new Map<string, number>();
	for (const font of fonts) {
		for (const script of toBaseScripts(font.scripts)) {
			counts.set(script, (counts.get(script) ?? 0) + 1);
		}
	}

	return [...counts.keys()]
		.filter((script) => (counts.get(script) ?? 0) >= scriptThreshold)
		.toSorted((first, second) => {
			const byCount = (counts.get(second) ?? 0) - (counts.get(first) ?? 0);

			return byCount === 0 ? first.localeCompare(second) : byCount;
		});
}

// Collapse a font's raw subsets to the writing systems it targets:
// Drop auxiliary glyph subsets and fold `-ext`/Vietnamese into their base
// Turns "has glyphs for" into "is built for", which is what makes decluttering meaningful
export function toBaseScripts(scripts: Array<string>): Array<string> {
	const base = new Set<string>();
	for (const subset of scripts) {
		if (auxiliarySubsets.has(subset)) continue;
		base.add(subset === 'vietnamese' ? 'latin' : subset.replace(/-ext$/, ''));
	}

	return [...base];
}

function toTitleCase(raw: string): string {
	return raw
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}
