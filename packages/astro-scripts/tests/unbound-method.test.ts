import { ESLint } from 'eslint';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { expect, test } from 'vitest';

const packageRoot = path.resolve(import.meta.dirname, '..');

test('a consumer can pass `log`, `Status` and `Progress` members as values under `@typescript-eslint/unbound-method`', async () => {
	const eslint = new ESLint({
		cwd: packageRoot,
		overrideConfig: [
			{
				files: ['**/*.ts'],
				languageOptions: {
					parser: tseslint.parser,
					parserOptions: { projectService: true, tsconfigRootDir: packageRoot },
				},
				plugins: { '@typescript-eslint': tseslint.plugin },
				rules: { '@typescript-eslint/unbound-method': 'error' },
			},
		],
		overrideConfigFile: true,
	});

	const [result] = await eslint.lintFiles(['tests/fixtures/detached-members.ts']);

	expect(result?.messages).toEqual([]);
}, 30_000);
