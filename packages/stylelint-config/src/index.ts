import type { Config } from 'stylelint';

import { tailwind } from './tailwind.js';

const config: Config = {
	extends: ['stylelint-config-standard', 'stylelint-config-recess-order'],
	languageOptions: tailwind.languageOptions,
	overrides: [
		{
			customSyntax: 'postcss-html',
			files: ['**/*.astro'],
		},
	],
	plugins: ['stylelint-plugin-defensive-css', '@double-great/stylelint-a11y'],
	rules: {
		'import-notation': 'string',
		...tailwind.rules,
		'a11y/no-outline-none': true,
		'a11y/selector-pseudo-class-focus': true,
		'color-named': 'never',
		'defensive-css/no-mixed-vendor-prefixes': true,
		'defensive-css/no-unsafe-will-change': true,
		'defensive-css/require-background-repeat': true,
		'max-nesting-depth': [
			3,
			{ ignore: ['pseudo-classes'], ignoreAtRules: ['media', 'supports', 'container'] },
		],
	},
};

export default config;
