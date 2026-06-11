import { mdxToJs } from 'satteri';
import { describe, expect, test } from 'vitest';

import { imgGroupSatteriPlugin } from '../src/index.js';

async function compile(source: string): Promise<string> {
	const result = await mdxToJs(source, {
		fileURL: new URL('file:///project/test.mdx'),
		mdastPlugins: [imgGroupSatteriPlugin()],
	});

	return result.code;
}

function contexts(code: string): Array<string | undefined> {
	return [...code.matchAll(/context:\s*"(\w+)"/g)].map((match) => match[1]);
}

function imageCount(code: string): string | undefined {
	return /imageCount:\s*"(\d+)"/.exec(code)?.[1];
}

function imageCounts(code: string): Array<string | undefined> {
	return [...code.matchAll(/imageCount:\s*"(\d+)"/g)].map((match) => match[1]);
}

describe('imgGroupSatteriPlugin', () => {
	test('stamps imageCount and the default grid context onto a group', async () => {
		const code = await compile(
			'<ImgGroup>\n<Img src="a.jpg" />\n<Img src="b.jpg" />\n</ImgGroup>\n',
		);

		expect(imageCount(code)).toBe('2');
		expect(contexts(code)).toEqual(['grid', 'grid']);
	});

	test('stamps the carousel context when layout="carousel"', async () => {
		const code = await compile(
			'<ImgGroup layout="carousel">\n<Img src="a" />\n<Img src="b" />\n<Img src="c" />\n</ImgGroup>\n',
		);

		expect(imageCount(code)).toBe('3');
		expect(contexts(code)).toEqual(['carousel', 'carousel', 'carousel']);
	});

	test('counts a single-image grid', async () => {
		const code = await compile('<ImgGroup>\n<Img src="only.jpg" />\n</ImgGroup>\n');

		expect(imageCount(code)).toBe('1');
		expect(contexts(code)).toEqual(['grid']);
	});

	test('leaves a standalone Img (outside a group) unstamped', async () => {
		const code = await compile('<Img src="a.jpg" />\n');

		expect(contexts(code)).toEqual([]);
		expect(code).not.toContain('imageCount');
	});

	test('compiles even when authoring is invalid (diagnostics are non-blocking)', async () => {
		const code = await compile('<ImgGroup layout="bogus">\n<Img src="a" />\n</ImgGroup>\n');

		expect(code).toContain('ImgGroup');
	});

	test('stamps multiple groups in one document independently', async () => {
		const code = await compile(
			'<ImgGroup>\n<Img src="a" />\n<Img src="b" />\n</ImgGroup>\n\n<ImgGroup layout="carousel">\n<Img src="c" />\n<Img src="d" />\n</ImgGroup>\n',
		);

		expect(imageCounts(code)).toEqual(['2', '2']);
		expect(contexts(code)).toEqual(['grid', 'grid', 'carousel', 'carousel']);
	});
});
