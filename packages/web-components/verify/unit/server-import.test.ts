import { expect, test } from 'vitest';

test('every subpath imports where the DOM is absent, as in Astro frontmatter', async () => {
	expect(globalThis.window).toBeUndefined();

	const modules = await Promise.all([
		import('../../src/path-suggestions/index.js'),
		import('../../src/progress-loading/index.js'),
		import('../../src/progress-reading/index.js'),
		import('../../src/top-button/index.js'),
	]);

	expect(
		modules.map((module) => Object.keys(module).find((name) => name.startsWith('define'))),
	).toEqual([
		'definePathSuggestions',
		'defineProgressLoading',
		'defineProgressReading',
		'defineTopButton',
	]);
});
