import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { describe, expect, test } from 'vitest';

import type { RemarkImageImportOptions } from '../src/index.js';

import { remarkImageImport } from '../src/index.js';

function countMatches(source: string, pattern: RegExp): number {
	return source.match(pattern)?.length ?? 0;
}

async function process(input: string, options?: RemarkImageImportOptions): Promise<string> {
	const file = await unified()
		.use(remarkParse)
		.use(remarkMdx)
		.use(remarkImageImport(options))
		.use(remarkStringify)
		.process(input);
	return String(file);
}

describe('remarkImageImport', () => {
	test('leaves plain markdown untouched', async () => {
		const output = await process('No change to plain text');

		expect(output).toContain('No change to plain text');
		expect(output).not.toContain('import');
	});

	test('rewrites a string src into an image import', async () => {
		const output = await process('<Img src="./photo.jpg" />');

		expect(output).toContain('import Img1 from "./photo.jpg";');
		expect(output).toContain('src={Img1}');
		expect(output).not.toContain('src="./photo.jpg"');
	});

	test('dedupes repeated paths to a single import', async () => {
		const output = await process('<Img src="./a.jpg" /><Img src="./b.jpg" /><Img src="./a.jpg" />');

		expect(output).toContain('import Img1 from "./a.jpg";');
		expect(output).toContain('import Img2 from "./b.jpg";');
		expect(countMatches(output, /^import /gm)).toBe(2);
		expect(countMatches(output, /src=\{Img1\}/g)).toBe(2);
		expect(countMatches(output, /src=\{Img2\}/g)).toBe(1);
	});

	test('prepends defaultPath to bare filenames', async () => {
		const output = await process('<Img src="photo.jpg" />');

		expect(output).toContain('import Img1 from "./photo.jpg";');
	});

	test('honours a custom defaultPath', async () => {
		const output = await process('<Img src="photo.jpg" />', { defaultPath: './assets/' });

		expect(output).toContain('import Img1 from "./assets/photo.jpg";');
	});

	test('honours a custom componentId and importPrefix', async () => {
		const output = await process('<Picture src="./photo.jpg" />', {
			componentId: 'Picture',
			importPrefix: 'Pic',
		});

		expect(output).toContain('import Pic1 from "./photo.jpg";');
		expect(output).toContain('src={Pic1}');
	});

	test('ignores components other than the configured one', async () => {
		const output = await process('<Figure src="./photo.jpg" />');

		expect(output).not.toContain('import');
		expect(output).toContain('src="./photo.jpg"');
	});

	test('leaves remote and data sources as plain strings', async () => {
		const remote = await process('<Img src="https://example.com/photo.jpg" />');
		const data = await process('<Img src="data:image/png;base64,iVBORw0KGgo=" />');

		expect(remote).not.toContain('import');
		expect(remote).toContain('https://example.com/photo.jpg');
		expect(data).not.toContain('import');
		expect(data).toContain('data:image/png;base64');
	});
});
