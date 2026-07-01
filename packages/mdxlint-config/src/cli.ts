#!/usr/bin/env node
import type { PluggableList } from 'unified';

import chalk from 'chalk';
import { mdxlint } from 'mdxlint';
import { access, glob, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createLinter, loadTextlintrc } from 'textlint';

interface MdxlintConfig {
	plugins?: PluggableList;
	settings?: Record<string, unknown>;
}

async function fileExists(filePath: string) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

const { positionals, values } = parseArgs({
	allowPositionals: true,
	args: process.argv.slice(2),
	options: {
		fix: { default: false, type: 'boolean' },
		'root-path': { default: process.cwd(), type: 'string' },
	},
});

const targetDir = positionals[0];

if (!targetDir) {
	console.error(chalk.red('Usage: mdxlint-content <target-package-dir> [--fix]'));
	process.exit(1);
}

const rootPath = values['root-path'];
const targetPath = path.resolve(rootPath, targetDir);
const shouldFix = values.fix;

// The config lives in the target package so the VS Code mdxlint extension can resolve it and its plugins
// Importing it here resolves those plugins relative to the config's own location, not this package
const mdxlintConfigPath = path.join(targetPath, '.mdxlintrc.mjs');

if (!(await fileExists(mdxlintConfigPath))) {
	console.error(chalk.red(`Missing mdxlint config: ${mdxlintConfigPath}`));
	process.exit(1);
}

const { default: mdxlintConfig } = (await import(pathToFileURL(mdxlintConfigPath).href)) as {
	default: MdxlintConfig;
};

const processor = mdxlint().data('settings', mdxlintConfig.settings);
processor.use(mdxlintConfig.plugins ?? []);

// Textlint is optional; a package may have an mdxlint config but no textlint config
const textlintConfigPath = path.join(targetPath, '.textlintrc.json');
const linter = (await fileExists(textlintConfigPath))
	? createLinter({ descriptor: await loadTextlintrc({ configFilePath: textlintConfigPath }) })
	: undefined;

let processed = 0;
let written = 0;
let skipped = 0;
let warnings = 0;
let failures = 0;

function reportMessages(relativePath: string, messages: ReadonlyArray<{ message: string }>) {
	for (const message of messages) {
		console.warn(`${relativePath}: ${message.message}`);
		warnings++;
	}
}

const mdxMatches = glob('collections/**/*.mdx', { cwd: targetPath });

for await (const match of mdxMatches) {
	const filePath = path.join(targetPath, match);
	const relativePath = path.relative(rootPath, filePath);
	processed++;

	// Isolate each file so one unparseable document reports cleanly instead of aborting the batch
	try {
		const original = await readFile(filePath, 'utf8');

		const result = await processor.process({ path: filePath, value: original });
		reportMessages(relativePath, result.messages);

		if (!shouldFix) {
			// A formatting-only rewrite (bullet, emphasis, indent) emits no lint message, so
			// compare against the original to flag files that fix-content would change
			if (String(result) !== original) {
				console.warn(`${relativePath}: needs formatting (run fix-content)`);
				warnings++;
			}
			if (linter) {
				const { messages } = await linter.lintText(original, filePath);
				reportMessages(relativePath, messages);
			}
			continue;
		}

		let formatted = String(result);

		if (linter) {
			const fixed = await linter.fixText(formatted, filePath);
			formatted = fixed.output;
			reportMessages(relativePath, fixed.messages);
		}

		// Conditional write: skip unchanged files so mtimes stay put and the dev server doesn't thrash
		if (formatted === original) {
			skipped++;
		} else {
			await writeFile(filePath, formatted);
			console.log(`${relativePath}: written`);
			written++;
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`${relativePath}: failed to process - ${message}`);
		failures++;
	}
}

if (processed === 0) {
	console.error(chalk.red(`No .mdx files found under ${targetDir}/collections`));
	process.exit(1);
}

if (shouldFix) {
	console.log(
		`\n${chalk.green(String(written))} written, ${String(skipped)} unchanged, ${String(warnings)} warning(s), ${String(failures)} failed`,
	);
} else {
	console.log(`\n${String(warnings)} warning(s), ${String(failures)} failed`);
}

// Hard failures fail both modes; lint/format warnings gate check mode only
if (failures > 0 || (!shouldFix && warnings > 0)) process.exit(1);
