import type { Config, ConfigWithExtends, ConfigWithExtendsArray } from '@eslint/config-helpers';

import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import { defineConfig } from '@eslint/config-helpers';
import eslint from '@eslint/js';
import astroPlugin from 'eslint-plugin-astro';
import perfectionist from 'eslint-plugin-perfectionist';
import unicornPlugin from 'eslint-plugin-unicorn';
import { configs as webComponentConfigs } from 'eslint-plugin-wc';
import globals from 'globals';
import tseslint from 'typescript-eslint';

type RestrictedSyntaxOption = string | { message?: string; selector: string };

// Extend via `getConfig(_, { restrictedSyntax })`
// Redefining the rule clobbers these, as ESLint replaces rule keys wholesale
export const restrictedSyntaxDefaults: Array<RestrictedSyntaxOption> = [
	{
		message: 'Separate type imports into their own `import type` statement.',
		selector: 'ImportDeclaration[importKind="value"] ImportSpecifier[importKind="type"]',
	},
	{
		message:
			'Use a ternary returning undefined (condition ? <Element /> : undefined) instead of && for conditional rendering.',
		selector:
			':matches(JSXElement, JSXFragment) > JSXExpressionContainer > LogicalExpression[operator="&&"]',
	},
];

// Astro plugin rules plus the `.astro` parser wiring and disableTypeChecked blocks it needs
// Types can't resolve through the Astro parser so `astro check` owns type checking
// For a11y, install eslint-plugin-jsx-a11y and pass a config (e.g. `astroPlugin.configs['flat/jsx-a11y-strict']`)
export function getAstroConfig(options?: {
	a11y?: ConfigWithExtendsArray;
}): ConfigWithExtendsArray {
	return [
		...astroPlugin.configs['flat/recommended'],
		...(options?.a11y ?? []),
		// Split from the disableTypeChecked block below so it doesn't clobber these parserOptions
		{
			files: ['**/*.astro'],
			languageOptions: {
				parserOptions: {
					extraFileExtensions: ['.astro'],
					parser: tseslint.parser,
				},
			},
		},
		{
			files: ['**/*.astro'],
			...tseslint.configs.disableTypeChecked,
		},
		{
			files: ['**/*.astro/*.ts', '*.astro/*.ts'],
			...tseslint.configs.disableTypeChecked,
		},
		{
			files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
			...tseslint.configs.disableTypeChecked,
		},
	];
}

export function getConfig(
	customConfig?: ConfigWithExtendsArray,
	options?: {
		customGlobals?: Record<string, 'readonly' | 'writeable'>;
		parserOptions?: NonNullable<Config['languageOptions']>['parserOptions'];
		restrictedSyntax?: Array<RestrictedSyntaxOption>;
	},
): ConfigWithExtendsArray {
	const customGlobals = options?.customGlobals ?? {};
	const restrictedSyntax = [...restrictedSyntaxDefaults, ...(options?.restrictedSyntax ?? [])];

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
				'no-restricted-syntax': ['error', ...restrictedSyntax],
			},
		},
		unicornPlugin.configs.recommended,
		{
			rules: {
				'unicorn/consistent-class-member-order': 'off', // Hoists private helpers above public lifecycle methods
				'unicorn/consistent-conditional-object-spread': ['error', 'ternary'], // Conditional inclusion stays a ternary, never &&, matching our JSX rendering rule
				'unicorn/filename-case': 'warn',
				'unicorn/max-nested-calls': ['error', { max: 5 }], // Zod schema composition and data pipelines legitimately nest past the default of 3
				'unicorn/name-replacements': 'off', // I *like* abbreviations!
				'unicorn/no-array-callback-reference': 'off', // I prefer this pattern for filtering/sorting content
				'unicorn/no-invalid-argument-count': 'off', // Off for performance (~1s per run); call arity is already enforced by tsc
				'unicorn/no-top-level-assignment-in-function': 'off', // Flags the legitimate lazy-singleton (instance ??= load()) cache pattern
				'unicorn/number-literal-case': ['error', { hexadecimalValue: 'lowercase' }], // Lowercase hex to match Prettier
				'unicorn/prefer-iterator-to-array': 'off', // Pushes Iterator#toArray(), which needs the esnext.iterator lib; spreads stay browser-safe
				'unicorn/prefer-uint8array-base64': 'off', // Uint8Array#toBase64() has thin browser support (Safari 18.4+)
			},
		},
		perfectionist.configs['recommended-natural'],
		{
			plugins: { '@eslint-community/eslint-comments': eslintComments },
			rules: {
				'@eslint-community/eslint-comments/require-description': [
					'error',
					{ ignore: ['eslint-enable'] },
				],
			},
		},
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
			'wc/guard-super-call': 'off', // Redundant under strict TS; we avoid custom-element inheritance
			'wc/max-elements-per-file': 'error',
			'wc/no-child-traversal-in-connectedcallback': 'off',
			'wc/no-constructor': 'error',
			'wc/no-exports-with-element': 'error',
			'wc/no-method-prefixed-with-on': 'error',
		},
	};
}
