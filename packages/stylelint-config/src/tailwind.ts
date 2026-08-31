import type { Config } from 'stylelint';

// Config rules and extensions to help Stylelint tolerate Tailwind v4's CSS-first API
const prelude = { prelude: '<any-value>' } as const;

// Declared so at-rule-no-unknown accepts them
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

// Ignored by name so function-no-unknown accepts them
const ignoreFunctions = ['theme', '--alpha', '--spacing', '--value', '--modifier', '--default'];

// Kebab-case, plus the paired modifier (`--text-2xl--line-height`) and the namespace reset (`--color-*`)
const customPropertyPattern = String.raw`^(\*|[a-z][a-z0-9]*(-[a-z0-9]+)*(-\*)?(--[a-z][a-z0-9]*(-[a-z0-9]+)*)?)$`;

export const tailwind = {
	languageOptions: { syntax: { atRules } },
	rules: {
		'custom-property-pattern': customPropertyPattern,
		'function-no-unknown': [true, { ignoreFunctions }],
		// `@utility` and `@custom-variant` compile down to a rule, so a top-level `&` resolves
		'nesting-selector-no-missing-scoping-root': [
			true,
			{ ignoreAtRules: ['utility', 'custom-variant'] },
		],
		// Tailwind entrypoints place @import after @theme/@source
		// eslint-disable-next-line unicorn/no-null -- Stylelint needs null to turn off an inherited rule
		'no-invalid-position-at-import-rule': null,
		// `@utility` takes declarations, so a `@media` nested inside it can hold them too
		'no-invalid-position-declaration': [true, { ignoreAtRules: ['utility'] }],
	},
} satisfies Config;
