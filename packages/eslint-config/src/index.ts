import type { Config, ConfigWithExtends, ConfigWithExtendsArray } from '@eslint/config-helpers';

import { defineConfig } from '@eslint/config-helpers';
import eslint from '@eslint/js';
import perfectionist from 'eslint-plugin-perfectionist';
import unicornPlugin from 'eslint-plugin-unicorn';
import { configs as webComponentConfigs } from 'eslint-plugin-wc';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export function getConfig(
	customConfig?: ConfigWithExtendsArray,
	options?: {
		customGlobals?: Record<string, 'readonly' | 'writeable'>;
		parserOptions?: NonNullable<Config['languageOptions']>['parserOptions'];
	},
): ConfigWithExtendsArray {
	const customGlobals = options?.customGlobals ?? {};

	const baseConfig = [
		eslint.configs.recommended,
		...tseslint.configs.strictTypeChecked,
		...tseslint.configs.stylisticTypeChecked,
		{
			languageOptions: {
				globals: {
					...globals.builtin,
					...globals.nodeBuiltin,
					...customGlobals,
				},
				parser: tseslint.parser,
				parserOptions: options?.parserOptions ?? {
					projectService: true,
				},
			},
			plugins: {
				'@typescript-eslint': tseslint.plugin,
			},
			rules: {
				'@typescript-eslint/array-type': ['warn', { default: 'generic' }],
				'@typescript-eslint/consistent-type-imports': [
					'error',
					{ fixStyle: 'separate-type-imports', prefer: 'type-imports' },
				],
				'@typescript-eslint/no-non-null-assertion': 'off',
				'@typescript-eslint/no-unused-vars': [
					'error',
					{
						argsIgnorePattern: '^_',
						caughtErrorsIgnorePattern: '^_',
						destructuredArrayIgnorePattern: '^_',
						ignoreRestSiblings: true,
						varsIgnorePattern: '^_',
					},
				],
				'@typescript-eslint/prefer-nullish-coalescing': 'off',
				'no-restricted-syntax': [
					'error',
					{
						message: 'Separate type imports into their own `import type` statement.',
						selector: 'ImportDeclaration[importKind="value"] ImportSpecifier[importKind="type"]',
					},
				],
			},
		},
		unicornPlugin.configs.recommended,
		{
			rules: {
				'unicorn/filename-case': 'warn',
				'unicorn/no-array-callback-reference': 'off', // I prefer this pattern for filtering/sorting content
				'unicorn/number-literal-case': ['error', { hexadecimalValue: 'lowercase' }], // Lowercase hex to match Prettier
				'unicorn/prevent-abbreviations': 'off', // I *like* abbreviations!
			},
		},
		perfectionist.configs['recommended-natural'],
	] satisfies Array<ConfigWithExtends>;

	return defineConfig(...baseConfig, ...(customConfig ?? []));
}

// Opt-in rules for authoring native web components
export function getWebComponentConfig(files: Array<string>): ConfigWithExtends {
	const bestPractice = webComponentConfigs['flat/best-practice'];

	return {
		...bestPractice,
		files,
		rules: {
			...bestPractice?.rules,
			'wc/define-tag-after-class-definition': 'error',
			'wc/guard-define-call': 'error',
			'wc/max-elements-per-file': 'error',
			'wc/no-child-traversal-in-connectedcallback': 'off',
			'wc/no-constructor': 'error',
			'wc/no-exports-with-element': 'error',
			'wc/no-method-prefixed-with-on': 'error',
		},
	};
}
