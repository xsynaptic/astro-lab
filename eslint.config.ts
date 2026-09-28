import { getAstroConfig, getConfig } from '@xsynaptic/eslint-config';
import tseslint from 'typescript-eslint';

export default getConfig([
	{
		ignores: ['**/dist/**', '**/node_modules/**', '**/.astro/**'],
	},
	...getAstroConfig(),
	{
		files: ['**/*.config.{ts,mts,mjs,js}', '**/test/**', '**/tests/**', '**/__tests__/**'],
		...tseslint.configs.disableTypeChecked,
	},
	{
		// Code complexity rules promoting higher quality agentic coding output
		rules: {
			complexity: ['warn', { max: 16, variant: 'modified' }],
			'max-depth': ['warn', 4],
			'max-lines-per-function': ['warn', { max: 145, skipBlankLines: true, skipComments: true }],
			'max-params': ['warn', 4],
			'max-statements': ['warn', 38],
		},
	},
	{
		// unpic-imagor is headed upstream to unpic; keep it free of sort churn and house ceilings for now
		files: ['packages/unpic-imagor/**'],
		rules: {
			complexity: 'off',
			'max-params': 'off',
			'max-statements': 'off',
			'perfectionist/sort-array-includes': 'off',
			'perfectionist/sort-classes': 'off',
			'perfectionist/sort-decorators': 'off',
			'perfectionist/sort-enums': 'off',
			'perfectionist/sort-export-attributes': 'off',
			'perfectionist/sort-exports': 'off',
			'perfectionist/sort-heritage-clauses': 'off',
			'perfectionist/sort-import-attributes': 'off',
			'perfectionist/sort-interfaces': 'off',
			'perfectionist/sort-intersection-types': 'off',
			'perfectionist/sort-jsx-props': 'off',
			'perfectionist/sort-maps': 'off',
			'perfectionist/sort-modules': 'off',
			'perfectionist/sort-named-exports': 'off',
			'perfectionist/sort-named-imports': 'off',
			'perfectionist/sort-object-types': 'off',
			'perfectionist/sort-objects': 'off',
			'perfectionist/sort-sets': 'off',
			'perfectionist/sort-switch-case': 'off',
			'perfectionist/sort-union-types': 'off',
			'perfectionist/sort-variable-declarations': 'off',
		},
	},
]);
