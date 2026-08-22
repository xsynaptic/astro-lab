import type { MdastPluginInput, MdxjsEsm } from 'satteri';

import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineMdastPlugin } from 'satteri';
import { z } from 'zod';

const namedImportSchema = z.union([z.string(), z.tuple([z.string(), z.string()])]);

// Bare path, or a path mapped to a namespace alias or a list of named imports
const importMapSchema = z.record(z.string(), z.union([z.string(), z.array(namedImportSchema)]));

const importsConfigSchema = z.array(z.union([z.string(), importMapSchema]));

const optionsSchema = z.object({ imports: importsConfigSchema });

type ImportsConfig = z.output<typeof importsConfigSchema>;

type NamedImportConfig = z.output<typeof namedImportSchema>;

type SatteriAutoImportOptions = z.input<typeof optionsSchema>;

const frontmatterTypes = new Set(['toml', 'yaml']);

function resolveModulePath(path: string): string {
	// Leave bare specifiers (npm modules) unresolved
	return path.startsWith('.') ? nodePath.resolve(path) : path;
}

// Guard that the derived name is a usable JS identifier
// The leading capital MDX wants comes from getDefaultImportName not this pattern
const identifierPattern = /^[$_\p{ID_Start}][$\p{ID_Continue}]*$/u;

export function autoImport(options: SatteriAutoImportOptions): MdastPluginInput {
	const { imports } = optionsSchema.parse(options);
	// Build the import statements once so bad config fails at setup, not per file
	const importsSource = processImportsConfig(imports).join('\n');

	// MDX hoists the injected node into a real top-level import
	return defineMdastPlugin({
		before(root, ctx) {
			// Only .mdx supports the ESM imports we inject
			if (!ctx.fileURL || !fileURLToPath(ctx.fileURL).endsWith('.mdx')) return;

			const leadingBlock = root.children.find((child) => !frontmatterTypes.has(child.type));
			if (!leadingBlock) return;

			// A value-only node; Sätteri re-parses `value` into the real import
			const importNode: MdxjsEsm = { type: 'mdxjsEsm', value: importsSource };
			// eslint-disable-next-line unicorn/prefer-modern-dom-apis -- ctx.insertBefore is Sätteri's mdast visitor API, not the DOM node method
			ctx.insertBefore(leadingBlock, importNode);
		},
		name: 'auto-import',
	});
}

function formatImport(imported: string, module: string): string {
	return `import ${imported} from ${JSON.stringify(module)};`;
}

function formatNamedImports(namedImports: Array<NamedImportConfig>): string {
	const imports = namedImports.map((namedImport) =>
		typeof namedImport === 'string' ? namedImport : `${namedImport[0]} as ${namedImport[1]}`,
	);

	return `{ ${imports.join(', ')} }`;
}

// PascalCase the filename into a component name, e.g. 'img-group.astro' => 'ImgGroup'
function getDefaultImportName(path: string): string {
	const name = nodePath
		.parse(path)
		.name.split(/[^\p{ID_Continue}]+/u)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join('');

	if (!identifierPattern.test(name)) {
		throw new Error(
			`satteri-auto-import: cannot derive a valid MDX component name from "${path}". Rename the file to start with a letter and use only identifier-safe characters, or import it explicitly.`,
		);
	}

	return name;
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

export type { SatteriAutoImportOptions };
