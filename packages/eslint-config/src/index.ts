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

// Exported because a scoped `no-restricted-syntax` replaces these wholesale; spread them back in
export const restrictedSyntaxDefaults: Array<RestrictedSyntaxOption> = [
	{
		message: 'Re-export named symbols explicitly; `export *` obscures output.',
		selector: 'ExportAllDeclaration',
	},
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

// Types can't resolve through the Astro parser, so `astro check` owns type checking
// `a11y` needs eslint-plugin-jsx-a11y installed in the consuming project
export function getAstroConfig(options?: {
	a11y?: 'recommended' | 'strict';
}): ConfigWithExtendsArray {
	return [
		...astroPlugin.configs['flat/recommended'],
		...(options?.a11y ? astroPlugin.configs[`flat/jsx-a11y-${options.a11y}`] : []),
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

// Node's globals are turned off by name, since flat config merges `globals` by key
// typescript-eslint turns `no-undef` off for TS files, and without it these globals bind nothing
export function getBrowserConfig(files: Array<string>): ConfigWithExtends {
	return {
		files,
		languageOptions: {
			globals: {
				...Object.fromEntries(Object.keys(globals.nodeBuiltin).map((name) => [name, 'off'])),
				...globals.browser,
			},
		},
		rules: {
			'no-undef': 'error',
			'unicorn/prefer-global-this': 'off',
		},
	};
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
		// Claude Code nests whole checkouts here, which would otherwise lint as project source
		{ ignores: ['.claude/worktrees/**'] },
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
				'logical-assignment-operators': ['error', 'never'],
				'no-restricted-syntax': ['error', ...restrictedSyntax],
			},
		},
		{
			rules: {
				complexity: ['warn', { max: 8, variant: 'modified' }],
				'max-depth': ['warn', 3],
				'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
				'max-params': ['warn', 3],
				'max-statements': ['warn', 25],
			},
		},
		unicornPlugin.configs.recommended,
		{
			rules: {
				'unicorn/consistent-class-member-order': 'off', // Hoists private helpers above public lifecycle methods
				'unicorn/consistent-compound-words': 'off', // Flags names that mirror an outside vocabulary, such as schema.org's WebSite
				'unicorn/consistent-conditional-object-spread': ['error', 'ternary'],
				'unicorn/filename-case': 'warn',
				'unicorn/logical-assignment-operators': 'off', // Inverse of the core rule; together they reject both forms
				'unicorn/max-nested-calls': ['error', { max: 5 }], // Zod schemas and data pipelines nest past the default of 3
				'unicorn/name-replacements': 'off', // I *like* abbreviations!
				'unicorn/no-array-callback-reference': 'off', // I prefer this pattern for filtering/sorting content
				'unicorn/no-array-sort': 'off', // Conflicts with Remeda's sort function
				'unicorn/no-invalid-argument-count': 'off', // tsc already enforces call arity
				'unicorn/no-top-level-assignment-in-function': 'off', // Flags the lazy-singleton cache pattern
				'unicorn/number-literal-case': ['error', { hexadecimalValue: 'lowercase' }], // Matches Prettier
				'unicorn/prefer-combined-guards': 'off', // Merges guards that check distinct things into one compound condition
				'unicorn/prefer-early-return': 'off', // Since v75 it inverts an optional trailing block, which is not the guard-clause pattern
				'unicorn/prefer-iterator-to-array': 'off', // Iterator#toArray() needs the esnext.iterator lib
				'unicorn/prefer-ternary': 'off', // Since v75 it rewrites flat guard-clause ladders into ternary chains
				'unicorn/single-line-block-comment-style': 'off', // Rewrites single-line /* */ comments into three-line blocks
			},
		},
		perfectionist.configs['recommended-natural'],
		{
			rules: {
				'perfectionist/sort-modules': 'off', // Its fixer moves declarations blind to what depends on their order
			},
		},
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

	// After the project's config, so a repo's own length ceilings still skip tests
	const testConfig = {
		files: ['**/*.test.{ts,tsx}'],
		rules: {
			'max-lines-per-function': 'off',
			'max-statements': 'off',
		},
	} satisfies ConfigWithExtends;

	return defineConfig(...baseConfig, ...(customConfig ?? []), testConfig);
}

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
