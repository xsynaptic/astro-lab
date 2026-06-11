import { mdxToJs } from 'satteri';
import { describe, expect, test } from 'vitest';

import { autoImport } from '../src/index.js';

// Compile through Sätteri's real compiler; assertions read the generated module directly (no Astro build needed)
type Imports = Parameters<typeof autoImport>[0]['imports'];

const defaultImports: Imports = [{ './src/components/mdx/img.astro': [['default', 'Img']] }];

async function compile(
	source: string,
	{
		file = 'file:///project/test.mdx',
		imports = defaultImports,
	}: { file?: string; imports?: Imports } = {},
): Promise<string> {
	const plugin = autoImport({ imports });
	const result = await mdxToJs(source, { fileURL: new URL(file), mdastPlugins: [plugin] });

	return result.code;
}

describe('autoImport', () => {
	test('injects the configured import into compiled .mdx', async () => {
		const code = await compile('# Title\n\n<Img src="a" alt="b" />\n');

		expect(code).toContain('img.astro');
		expect(code).toMatch(/import \{ default as Img \} from/);
	});

	test('the component resolves from the import, not props.components', async () => {
		const code = await compile('<Img src="a" alt="b" />\n');

		expect(code).not.toContain('_missingMdxReference("Img"');
	});

	test('leaves plain .md untouched', async () => {
		const code = await compile('# Title\n\nText.\n', { file: 'file:///project/test.md' });

		expect(code).not.toContain('img.astro');
	});

	// Visit-order invariant: the import must land at top level whatever block type leads the document
	// This pins Sätteri's parent-before-child traversal as a tested assumption
	const shapes = [
		['heading-first', '# Title\n\n<Img src="a" alt="b" />\n'],
		['paragraph-first', 'Lead paragraph.\n\n<Img src="a" alt="b" />\n'],
		['list-first', '- one\n- two\n\n<Img src="a" alt="b" />\n'],
		['blockquote-first', '> quote\n\n<Img src="a" alt="b" />\n'],
		['component-first', '<Img src="a" alt="b" />\n\nTrailing text.\n'],
		['code-first', '```\ncode block\n```\n\n<Img src="a" alt="b" />\n'],
	] as const;

	test.each(shapes)('injects at top level for %s', async (_label, source) => {
		const code = await compile(source);

		expect(code).toContain('img.astro');
		expect(code.indexOf('import')).toBeLessThan(code.indexOf('_createMdxContent'));
	});

	test('resets per document so state does not leak across compiles', async () => {
		const md = await compile('text\n', { file: 'file:///a.md' });
		expect(md).not.toContain('img.astro');

		const mdx = await compile('<Img src="a" alt="b" />\n', { file: 'file:///b.mdx' });
		expect(mdx).toContain('img.astro');
	});

	test('supports bare-string config (default name derived from filename)', async () => {
		const code = await compile('<ImgGroup />\n', {
			imports: ['./src/components/mdx/img-group.astro'],
		});

		expect(code).toMatch(/import ImgGroup from/);
	});

	test('supports namespace-alias config', async () => {
		const code = await compile('<Ns.Thing />\n', {
			imports: [{ './src/components/mdx/img.astro': 'Ns' }],
		});

		expect(code).toMatch(/import \* as Ns from/);
	});
});
