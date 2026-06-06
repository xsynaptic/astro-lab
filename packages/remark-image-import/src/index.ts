import type { Root } from 'mdast';
import type {
	MdxjsEsm,
	MdxJsxAttribute,
	MdxJsxAttributeValueExpression,
	MdxJsxFlowElement,
	MdxJsxTextElement,
} from 'mdast-util-mdx';
import type { Plugin } from 'unified';
import type { Node } from 'unist';

import { parse as parseJs } from 'acorn';
import { visit } from 'unist-util-visit';
import { z } from 'zod';

const optionsSchema = z.object({
	// JSX component whose `src` attribute is rewritten into an image import
	componentId: z.string().default('Img'),
	// Prepended to bare `src` values that aren't already a recognised path
	defaultPath: z.string().default('./'),
	// Prefix for generated import identifiers (`Img1`, `Img2`, ...)
	importPrefix: z.string().default('Img'),
});

type Estree = NonNullable<MdxjsEsm['data']>['estree'];

type RemarkImageImportOptions = z.input<typeof optionsSchema>;

export function remarkImageImport(options?: RemarkImageImportOptions): Plugin<[], Root> {
	const settings = optionsSchema.parse(options ?? {});

	return function () {
		return function (tree) {
			const importStatements = new Map<string, MdxjsEsm>();
			const importIds = new Map<string, number>();
			let counter = 1;

			visit(tree, ['mdxJsxFlowElement', 'mdxJsxTextElement'], (node) => {
				if (!isMdxJsxFlowElement(node) && !isMdxJsxTextElement(node)) return;
				if (node.name !== settings.componentId) return;

				// Only literal string sources are rewritten; expressions are left untouched
				const srcAttribute = node.attributes.find(
					(attribute): attribute is MdxJsxAttribute =>
						attribute.type === 'mdxJsxAttribute' &&
						attribute.name === 'src' &&
						typeof attribute.value === 'string',
				);

				if (!srcAttribute || typeof srcAttribute.value !== 'string') return;
				if (isExternalSrc(srcAttribute.value)) return;

				const src = hasExplicitPath(srcAttribute.value)
					? srcAttribute.value
					: `${settings.defaultPath}${srcAttribute.value}`;

				// Reuse one identifier per unique path so repeated images import once
				let importId = importIds.get(src);

				if (importId === undefined) {
					importId = counter;
					counter += 1;
					importIds.set(src, importId);
				}

				const importName = `${settings.importPrefix}${String(importId)}`;

				const valueExpression: MdxJsxAttributeValueExpression = {
					data: { estree: parseProgram(importName) },
					type: 'mdxJsxAttributeValueExpression',
					value: importName,
				};

				const index = node.attributes.indexOf(srcAttribute);

				node.attributes[index] = {
					name: 'src',
					type: 'mdxJsxAttribute',
					value: valueExpression,
				};

				if (!importStatements.has(src)) {
					const js = `import ${importName} from ${JSON.stringify(src)};`;

					importStatements.set(src, {
						data: { estree: parseProgram(js) },
						type: 'mdxjsEsm',
						value: js,
					});
				}
			});

			const importValues = [...importStatements.values()];

			if (importValues.length > 0) {
				tree.children.unshift(...importValues);
			}
		};
	};
}

// Sources that already carry a path (relative, absolute, or alias) are imported
// as-is; bare filenames get `defaultPath` prepended
function hasExplicitPath(src: string): boolean {
	return src.startsWith('.') || src.startsWith('/') || src.startsWith('@');
}

// Remote URLs and data URIs can't be ESM-imported, so they're left as plain
// string sources for the component (and Astro) to handle directly
function isExternalSrc(src: string): boolean {
	return src.startsWith('http') || src.startsWith('data:');
}

function isMdxJsxFlowElement(node: Node): node is MdxJsxFlowElement {
	return node.type === 'mdxJsxFlowElement';
}

function isMdxJsxTextElement(node: Node): node is MdxJsxTextElement {
	return node.type === 'mdxJsxTextElement';
}

// Acorn's AST is structurally compatible with the estree types MDX expects
function parseProgram(js: string): Estree {
	return parseJs(js, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as Estree;
}

export type { RemarkImageImportOptions };
