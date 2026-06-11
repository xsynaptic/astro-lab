import type {
	MdastNode,
	MdastPluginDefinition,
	MdastPluginInput,
	MdastPluginInstance,
	MdxjsEsm,
} from 'satteri';

import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const namedImportSchema = z.union([z.string(), z.tuple([z.string(), z.string()])]);

// Bare path, or a path mapped to a namespace alias or a list of named imports
const importsConfigSchema = z.array(
	z.union([z.string(), z.record(z.string(), z.union([z.string(), z.array(namedImportSchema)]))]),
);

const optionsSchema = z.object({ imports: importsConfigSchema });

type ImportsConfig = z.output<typeof importsConfigSchema>;

type NamedImportConfig = z.output<typeof namedImportSchema>;

type SatteriAutoImportOptions = z.input<typeof optionsSchema>;

// Block-level node types that can lead a document
// Excludes frontmatter (yaml/toml) so imports land after it
// Excludes listItem/tableRow/tableCell which are never root-level
const blockVisitorKeys = [
	'paragraph',
	'heading',
	'thematicBreak',
	'blockquote',
	'list',
	'html',
	'code',
	'definition',
	'table',
	'footnoteDefinition',
	'math',
	'containerDirective',
	'leafDirective',
	'mdxJsxFlowElement',
	'mdxFlowExpression',
	'mdxjsEsm',
] as const;

function resolveModulePath(path: string): string {
	// Leave bare specifiers (npm modules) unresolved
	return path.startsWith('.') ? nodePath.resolve(path) : path;
}

// Guard that the derived name is a usable JS identifier
// The leading capital MDX wants comes from getDefaultImportName not this pattern
const identifierPattern = /^[$_\p{ID_Start}][$\p{ID_Continue}]*$/u;

// Sätteri's visitor context, recovered from its exported plugin shape (it isn't exported by name)
type MdastVisitorContext = Parameters<NonNullable<MdastPluginInstance['paragraph']>>[1];

export function autoImport(options: SatteriAutoImportOptions): MdastPluginInput {
	const { imports } = optionsSchema.parse(options);
	// Build the import statements once so bad config fails at setup, not per file
	const importsSource = processImportsConfig(imports).join('\n');

	// Sätteri has no root hook, so inject the import before the first block we visit
	// Document-order parent-before-child traversal makes that the document's first root child
	// MDX then hoists the injected node into a real top-level import
	// Factory form: Sätteri calls it once per document so `handled` resets between documents
	return () => {
		let handled = false;

		const visit = (node: Readonly<MdastNode>, ctx: MdastVisitorContext): void => {
			if (handled) return;
			handled = true;

			// Only .mdx supports the ESM imports we inject
			if (!ctx.fileURL || !fileURLToPath(ctx.fileURL).endsWith('.mdx')) return;

			// A value-only node; Sätteri re-parses `value` into the real import
			const importNode: MdxjsEsm = { type: 'mdxjsEsm', value: importsSource };
			// eslint-disable-next-line unicorn/prefer-modern-dom-apis -- ctx.insertBefore is Sätteri's mdast visitor API, not the DOM node method
			ctx.insertBefore(node, importNode);
		};

		const definition: MdastPluginDefinition = { name: 'auto-import' };
		for (const key of blockVisitorKeys) definition[key] = visit;

		return definition;
	};
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
