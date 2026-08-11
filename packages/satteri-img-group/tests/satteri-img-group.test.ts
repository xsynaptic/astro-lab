import { mdxToJs } from 'satteri';
import { describe, expect, test } from 'vitest';

import { imgGroupSatteriPlugin } from '../src/index.js';

const options = {
	contexts: {
		carousel: { disallowedAttributes: ['columns'], minImages: 2 },
		grid: {},
		masonry: {},
	},
	defaultContext: 'grid',
	layouts: ['default', 'wide', 'full'],
};

async function compile(source: string): Promise<string> {
	const result = await mdxToJs(source, {
		fileURL: new URL('file:///project/test.mdx'),
		mdastPlugins: [imgGroupSatteriPlugin(options)],
	});

	return result.code;
}

// The group is stamped before its children, so the first match of each run belongs to the group
function contexts(code: string): Array<string | undefined> {
	return [...code.matchAll(/context:\s*"([\w-]+)"/g)].map((match) => match[1]);
}

function imageCount(code: string): string | undefined {
	return /imageCount:\s*"(\d+)"/.exec(code)?.[1];
}

function imageCounts(code: string): Array<string | undefined> {
	return [...code.matchAll(/imageCount:\s*"(\d+)"/g)].map((match) => match[1]);
}

describe('imgGroupSatteriPlugin', () => {
	test('stamps imageCount and the default context onto the group and its children', async () => {
		const code = await compile(
			'<ImgGroup>\n<Img src="a.jpg" />\n<Img src="b.jpg" />\n</ImgGroup>\n',
		);

		expect(imageCount(code)).toBe('2');
		expect(contexts(code)).toEqual(['grid', 'grid', 'grid']);
	});

	test('stamps a context declared only in options', async () => {
		const code = await compile(
			'<ImgGroup context="masonry">\n<Img src="a" />\n<Img src="b" />\n</ImgGroup>\n',
		);

		expect(contexts(code)).toEqual(['masonry', 'masonry', 'masonry']);
	});

	test('accepts a layout on a non-default context', async () => {
		const code = await compile(
			'<ImgGroup context="carousel" layout="full">\n<Img src="a" />\n<Img src="b" />\n</ImgGroup>\n',
		);

		expect(code).toContain('layout: "full"');
		expect(contexts(code)).toEqual(['carousel', 'carousel', 'carousel']);
	});

	test('counts a single-image group when the context has no minimum', async () => {
		const code = await compile('<ImgGroup>\n<Img src="only.jpg" />\n</ImgGroup>\n');

		expect(imageCount(code)).toBe('1');
		expect(contexts(code)).toEqual(['grid', 'grid']);
	});

	test('allows an attribute that only another context disallows', async () => {
		const code = await compile(
			'<ImgGroup columns="3">\n<Img src="a" />\n<Img src="b" />\n</ImgGroup>\n',
		);

		expect(code).toContain('columns: "3"');
	});

	test('leaves a standalone Img (outside a group) unstamped', async () => {
		const code = await compile('<Img src="a.jpg" />\n');

		expect(contexts(code)).toEqual([]);
		expect(code).not.toContain('imageCount');
	});

	test('stamps multiple groups in one document independently', async () => {
		const code = await compile(
			'<ImgGroup>\n<Img src="a" />\n<Img src="b" />\n</ImgGroup>\n\n<ImgGroup context="carousel">\n<Img src="c" />\n<Img src="d" />\n</ImgGroup>\n',
		);

		expect(imageCounts(code)).toEqual(['2', '2']);
		expect(contexts(code)).toEqual(['grid', 'grid', 'grid', 'carousel', 'carousel', 'carousel']);
	});

	describe('options validation', () => {
		test('throws when defaultContext names a context that does not exist', () => {
			expect(() =>
				imgGroupSatteriPlugin({
					contexts: { grid: {} },
					defaultContext: 'carousel',
					layouts: ['default'],
				}),
			).toThrow(/defaultContext.*must be a key of/s);
		});
	});

	describe('blocking validation (throws, like the unified original)', () => {
		test('throws on an unknown context', async () => {
			await expect(
				compile('<ImgGroup context="bogus">\n<Img src="a" />\n</ImgGroup>\n'),
			).rejects.toThrow(/"context" must be one of carousel, grid, masonry, received "bogus"/);
		});

		test('throws on an unknown layout', async () => {
			await expect(
				compile('<ImgGroup layout="bogus">\n<Img src="a" />\n</ImgGroup>\n'),
			).rejects.toThrow(/"layout" must be one of default, wide, full, received "bogus"/);
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

		test('throws when a context minimum is not met', async () => {
			await expect(
				compile('<ImgGroup context="carousel">\n<Img src="a" />\n</ImgGroup>\n'),
			).rejects.toThrow(/carousel needs at least 2 images, found 1/);
		});

		test('throws when an Img inside a group sets its own layout', async () => {
			await expect(
				compile('<ImgGroup>\n<Img src="a" layout="wide" />\n<Img src="b" />\n</ImgGroup>\n'),
			).rejects.toThrow(/"layout" has no effect inside an <ImgGroup>/);
		});

		test('throws when an Img inside a group sets its own context', async () => {
			await expect(
				compile('<ImgGroup>\n<Img src="a" context="carousel" />\n<Img src="b" />\n</ImgGroup>\n'),
			).rejects.toThrow(/"context" has no effect inside an <ImgGroup>/);
		});

		test('throws when a disallowed attribute is set on a context', async () => {
			await expect(
				compile(
					'<ImgGroup context="carousel" columns="3">\n<Img src="a" />\n<Img src="b" />\n</ImgGroup>\n',
				),
			).rejects.toThrow(/"columns" has no effect on carousel/);
		});

		test('reports the source position in the thrown message', async () => {
			await expect(
				compile('<ImgGroup layout="bogus">\n<Img src="a" />\n</ImgGroup>\n'),
			).rejects.toThrow(/test\.mdx:1:1/);
		});
	});
});
