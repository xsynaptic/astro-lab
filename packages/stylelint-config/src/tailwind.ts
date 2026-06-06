import type { Config } from 'stylelint';

// A set of config rules and extensions to help Stylelint tolerate Tailwind v4's CSS-first API
const prelude = { prelude: '<any-value>' } as const;

// At-rules, declared so at-rule-no-unknown accepts them
// @reference appears inside component <style> blocks (e.g. Astro scoped styles)
// @config and @plugin bridge from a v3 JS config
const atRules = {
	apply: prelude,
	theme: prelude,
	source: prelude,
	utility: prelude,
	variant: prelude,
	'custom-variant': prelude,
	reference: prelude,
	config: prelude,
	plugin: prelude,
};

// Functions Tailwind adds, ignored by name so function-no-unknown accepts them
const ignoreFunctions = ['theme', '--alpha', '--spacing', '--value', '--modifier', '--default'];

export const tailwind = {
	languageOptions: { syntax: { atRules } },
	rules: {
		// Tailwind entrypoints place @import after @theme/@source, which this rule forbids
		// eslint-disable-next-line unicorn/no-null -- Stylelint needs null to turn off an inherited rule
		'no-invalid-position-at-import-rule': null,
		'function-no-unknown': [true, { ignoreFunctions }],
	},
} satisfies Config;
