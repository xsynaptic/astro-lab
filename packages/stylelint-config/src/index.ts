import type { Config } from 'stylelint';

import { tailwind } from './tailwind.js';

const config: Config = {
	extends: ['stylelint-config-standard', 'stylelint-config-recess-order'],
	plugins: ['stylelint-plugin-defensive-css', '@double-great/stylelint-a11y'],
	languageOptions: tailwind.languageOptions,
	rules: {
		'import-notation': 'string',
		...tailwind.rules,
		'max-nesting-depth': [
			3,
			{ ignore: ['pseudo-classes'], ignoreAtRules: ['media', 'supports', 'container'] },
		],
		'color-named': 'never',
		'defensive-css/no-mixed-vendor-prefixes': true,
		'defensive-css/no-unsafe-will-change': true,
		'defensive-css/require-background-repeat': true,
		'a11y/no-outline-none': true,
		'a11y/selector-pseudo-class-focus': true,
	},
	overrides: [
		{
			files: ['**/*.astro'],
			customSyntax: 'postcss-html',
		},
	],
};

export default config;
