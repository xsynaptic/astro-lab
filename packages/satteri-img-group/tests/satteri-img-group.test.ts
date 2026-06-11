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

	test('stamps multiple groups in one document independently', async () => {
		const code = await compile(
			'<ImgGroup>\n<Img src="a" />\n<Img src="b" />\n</ImgGroup>\n\n<ImgGroup layout="carousel">\n<Img src="c" />\n<Img src="d" />\n</ImgGroup>\n',
		);

		expect(imageCounts(code)).toEqual(['2', '2']);
		expect(contexts(code)).toEqual(['grid', 'grid', 'carousel', 'carousel']);
	});

	describe('blocking validation (throws, like the unified original)', () => {
		test('throws on an invalid layout', async () => {
			await expect(
				compile('<ImgGroup layout="bogus">\n<Img src="a" />\n</ImgGroup>\n'),
			).rejects.toThrow(/must be one of/);
		});

		test('throws when a group contains a non-Img child', async () => {
			await expect(compile('<ImgGroup>\n<Video src="a" />\n</ImgGroup>\n')).rejects.toThrow(
				/may only contain <Img> children/,
			);
		});

		test('throws on an empty group', async () => {
			await expect(compile('<ImgGroup></ImgGroup>\n')).rejects.toThrow(
				/contains no <Img> children/,
			);
		});

		test('throws when a carousel has fewer than two images', async () => {
			await expect(
				compile('<ImgGroup layout="carousel">\n<Img src="a" />\n</ImgGroup>\n'),
			).rejects.toThrow(/needs at least two images/);
		});

		test('throws when an Img inside a group sets its own layout', async () => {
			await expect(
				compile('<ImgGroup>\n<Img src="a" layout="wide" />\n<Img src="b" />\n</ImgGroup>\n'),
			).rejects.toThrow(/has no effect inside an <ImgGroup>/);
		});

		test('throws when columns is set on a carousel', async () => {
			await expect(
				compile(
					'<ImgGroup layout="carousel" columns="3">\n<Img src="a" />\n<Img src="b" />\n</ImgGroup>\n',
				),
			).rejects.toThrow(/has no effect on a carousel/);
		});

		test('reports the source position in the thrown message', async () => {
			await expect(
				compile('<ImgGroup layout="bogus">\n<Img src="a" />\n</ImgGroup>\n'),
			).rejects.toThrow(/test\.mdx:1:1/);
		});
	});
});
