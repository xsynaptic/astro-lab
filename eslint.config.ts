import { getConfig } from '@xsynaptic/eslint-config';
import tseslint from 'typescript-eslint';

export default getConfig([
	{
		ignores: ['**/dist/**', '**/node_modules/**', 'playground/**'],
	},
	{
		files: ['**/*.config.{ts,mts,mjs,js}', '**/test/**', '**/tests/**', '**/__tests__/**'],
		...tseslint.configs.disableTypeChecked,
	},
	{
		// unpic-imagor is headed upstream to unpic; keep it free of sort churn for now
		files: ['packages/unpic-imagor/**'],
		rules: {
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
