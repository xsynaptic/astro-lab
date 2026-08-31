import type { Config } from 'stylelint';

// A set of config rules and extensions to help Stylelint tolerate Tailwind v4's CSS-first API
const prelude = { prelude: '<any-value>' } as const;

// At-rules, declared so at-rule-no-unknown accepts them
// @reference appears inside component <style> blocks (e.g. Astro scoped styles)
// @config and @plugin bridge from a v3 JS config
const atRules = {
	apply: prelude,
	config: prelude,
	'custom-variant': prelude,
	plugin: prelude,
	reference: prelude,
	source: prelude,
	theme: prelude,
	utility: prelude,
	variant: prelude,
};

// Functions Tailwind adds, ignored by name so function-no-unknown accepts them
const ignoreFunctions = ['theme', '--alpha', '--spacing', '--value', '--modifier', '--default'];

// Kebab-case, plus the paired modifier (`--text-2xl--line-height`) and the namespace reset (`--color-*`)
// Tailwind's theme uses both forms, which stylelint-config-standard's pattern rejects
const customPropertyPattern = String.raw`^(\*|[a-z][a-z0-9]*(-[a-z0-9]+)*(-\*)?(--[a-z][a-z0-9]*(-[a-z0-9]+)*)?)$`;

export const tailwind = {
	languageOptions: { syntax: { atRules } },
	rules: {
		'custom-property-pattern': customPropertyPattern,
		'function-no-unknown': [true, { ignoreFunctions }],
		// Tailwind entrypoints place @import after @theme/@source, which this rule forbids
		// eslint-disable-next-line unicorn/no-null -- Stylelint needs null to turn off an inherited rule
		'no-invalid-position-at-import-rule': null,
	},
} satisfies Config;
