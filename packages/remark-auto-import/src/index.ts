import type { Root } from 'mdast';
import type { MdxjsEsm } from 'mdast-util-mdx';
import type { Plugin } from 'unified';

import { parse as parseJs } from 'acorn';
import nodePath from 'node:path';
import { z } from 'zod';

const namedImportSchema = z.union([z.string(), z.tuple([z.string(), z.string()])]);

// This plugin accepts either:
// 1) a bare path
// 2) a path mapped to either a namespace alias (`* as X`) or a list of named imports
const importMapSchema = z.record(z.string(), z.union([z.string(), z.array(namedImportSchema)]));

const importsConfigSchema = z.array(z.union([z.string(), importMapSchema]));

const optionsSchema = z.object({
	imports: importsConfigSchema,
});

type ImportsConfig = z.output<typeof importsConfigSchema>;

type NamedImportConfig = z.output<typeof namedImportSchema>;

type RemarkAutoImportOptions = z.input<typeof optionsSchema>;

function resolveModulePath(path: string): string {
	// Bare specifiers (e.g. npm modules) are left unresolved
	if (path.startsWith('.')) return nodePath.resolve(path);

	return path;
}

// MDX restricts component names to valid JS identifiers with a leading capital letter
// @link -- https://mdxjs.com/docs/using-mdx/
const identifierPattern = /^[$_\p{ID_Start}][$\u{200C}\u{200D}\p{ID_Continue}]*$/u;

export function remarkAutoImport(options: RemarkAutoImportOptions): Plugin<[], Root> {
	const { imports } = optionsSchema.parse(options);
	// Derive and validate import statements once up front so bad config fails at setup, not per file
	const importsSource = processImportsConfig(imports).join('\n');

	return function () {
		return function (tree, file) {
			// Only .mdx supports the ESM imports we inject; plain .md is left untouched
			if (file.basename?.endsWith('.mdx')) {
				// fresh node per file; the estree is mutable and must not be aliased across trees
				tree.children.unshift(parseImportsNode(importsSource));
			}
		};
	};
}

function formatImport(imported: string, module: string): string {
	return `import ${imported} from ${JSON.stringify(module)};`;
}

function formatNamedImports(namedImports: Array<NamedImportConfig>): string {
	const imports: Array<string> = [];

	for (const namedImport of namedImports) {
		if (typeof namedImport === 'string') {
			imports.push(namedImport);
		} else {
			const [from, as] = namedImport;
			imports.push(`${from} as ${as}`);
		}
	}

	return `{ ${imports.join(', ')} }`;
}

// PascalCase the filename into a component name, *e.g.* 'complex-component.astro' => 'ComplexComponent'
// Splitting on non-identifier characters keeps Unicode letters (e.g. 'señor' => 'Señor') intact
function getDefaultImportName(path: string): string {
	const name = nodePath
		.parse(path)
		.name.split(/[^\p{ID_Continue}]+/u)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join('');

	if (!identifierPattern.test(name)) {
		throw new Error(
			`remark-auto-import: cannot derive a valid MDX component name from "${path}". Rename the file to start with a letter and use only identifier-safe characters, or import it explicitly.`,
		);
	}

	return name;
}

function parseImportsNode(js: string): MdxjsEsm {
	const estree = parseJs(js, { ecmaVersion: 'latest', sourceType: 'module' });

	return {
		// Acorn's AST nodes are structurally compatible with the estree types MDX expects
		data: { estree: estree as unknown as NonNullable<MdxjsEsm['data']>['estree'] },
		type: 'mdxjsEsm',
		value: js,
	};
}

function processImportsConfig(config: ImportsConfig): Array<string> {
	const imports: Array<string> = [];

	for (const option of config) {
		if (typeof option === 'string') {
			imports.push(formatImport(getDefaultImportName(option), resolveModulePath(option)));
			continue;
		}

		for (const [path, namedImportsOrNamespace] of Object.entries(option)) {
			if (typeof namedImportsOrNamespace === 'string') {
				imports.push(formatImport(`* as ${namedImportsOrNamespace}`, resolveModulePath(path)));
			} else {
				imports.push(
					formatImport(formatNamedImports(namedImportsOrNamespace), resolveModulePath(path)),
				);
			}
		}
	}

	return imports;
}

export type { RemarkAutoImportOptions };
