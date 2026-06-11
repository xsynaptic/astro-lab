import type { Root } from 'mdast';
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx';

import { createProcessor } from '@mdx-js/mdx';
import { visit } from 'unist-util-visit';
import { describe, expect, test } from 'vitest';

import { remarkImgGroup } from '../src/index.js';

// Parse through the same compiler Astro uses (@mdx-js/mdx), not bare remark-mdx
const capturedTrees: Array<Root> = [];

// eslint-disable-next-line unicorn/consistent-function-scoping -- a remark plugin is a curried attacher
const captureTree = () => (tree: Root) => {
	capturedTrees.push(tree);
};

const processor = createProcessor({ remarkPlugins: [remarkImgGroup, captureTree] });

function contexts(tree: Root): Array<string | undefined> {
	return findElements(tree, 'Img').map((image) => getAttribute(image, 'context'));
}

function findElements(tree: Root, name: string): Array<MdxJsxFlowElement> {
	const elements: Array<MdxJsxFlowElement> = [];

	visit(tree, 'mdxJsxFlowElement', (node) => {
		if (node.name === name) elements.push(node);
	});

	return elements;
}

function getAttribute(node: MdxJsxFlowElement, name: string): string | undefined {
	const attribute = node.attributes.find(
		(attr): attr is MdxJsxAttribute => attr.type === 'mdxJsxAttribute' && attr.name === name,
	);

	return typeof attribute?.value === 'string' ? attribute.value : undefined;
}

async function transform(input: string): Promise<Root> {
	capturedTrees.length = 0;

	await processor.process(input);

	const tree = capturedTrees.at(-1);

	if (!tree) throw new Error('remark tree was not captured');

	return tree;
}

// Catalog-shaped fragments: self-closing, captioned, and layout-bearing images
const standaloneFragments = [
	['self-closing', '<Img src="a.jpg" />\n'],
	['captioned', '<Img src="a.jpg">A caption.</Img>\n'],
	['layout wide, self-closing', '<Img src="a.jpg" layout="wide" />\n'],
	['layout full, captioned', '<Img src="a.jpg" layout="full">A caption.</Img>\n'],
] as const;

describe('standalone images are left untouched', () => {
	for (const [label, input] of standaloneFragments) {
		test(label, async () => {
			const tree = await transform(input);

			expect(contexts(tree)).toEqual([undefined]);
		});
	}
});

describe('context injection', () => {
	test('stamps grid context on a captioned group by default', async () => {
		const tree = await transform(
			'<ImgGroup>\n  <Img src="a.jpg">A caption.</Img>\n  <Img src="b.jpg">B caption.</Img>\n</ImgGroup>\n',
		);

		expect(contexts(tree)).toEqual(['grid', 'grid']);
	});

	test('stamps grid context on a mixed self-closing and captioned group', async () => {
		const tree = await transform(
			'<ImgGroup>\n  <Img src="a.jpg" />\n  <Img src="b.jpg">B caption.</Img>\n</ImgGroup>\n',
		);

		expect(contexts(tree)).toEqual(['grid', 'grid']);
	});

	test('treats an explicit default layout like the default', async () => {
		const tree = await transform(
			'<ImgGroup layout="default">\n  <Img src="a.jpg" />\n  <Img src="b.jpg" />\n</ImgGroup>\n',
		);

		expect(contexts(tree)).toEqual(['grid', 'grid']);
	});

	test('stamps carousel context when layout is carousel', async () => {
		const tree = await transform(
			'<ImgGroup layout="carousel">\n  <Img src="a.jpg">A caption.</Img>\n  <Img src="b.jpg">B caption.</Img>\n</ImgGroup>\n',
		);

		expect(contexts(tree)).toEqual(['carousel', 'carousel']);
	});
});

describe('image count injection', () => {
	test('injects the count of child images onto the group', async () => {
		const tree = await transform(
			'<ImgGroup>\n  <Img src="a.jpg" />\n  <Img src="b.jpg">B caption.</Img>\n  <Img src="c.jpg" />\n</ImgGroup>\n',
		);
		const [group] = findElements(tree, 'ImgGroup');

		expect(group && getAttribute(group, 'imageCount')).toBe('3');
	});
});

describe('does not reject valid usage', () => {
	test('allows columns on a grid', async () => {
		const tree = await transform(
			'<ImgGroup columns={2}>\n  <Img src="a.jpg" />\n  <Img src="b.jpg" />\n</ImgGroup>\n',
		);

		expect(contexts(tree)).toEqual(['grid', 'grid']);
	});

	test('allows a wide grid', async () => {
		const tree = await transform(
			'<ImgGroup layout="wide">\n  <Img src="a.jpg">A caption.</Img>\n  <Img src="b.jpg">B caption.</Img>\n</ImgGroup>\n',
		);

		expect(contexts(tree)).toEqual(['grid', 'grid']);
	});

	test('allows a wide carousel', async () => {
		const tree = await transform(
			'<ImgGroup layout="carousel-wide">\n  <Img src="a.jpg">A caption.</Img>\n  <Img src="b.jpg">B caption.</Img>\n</ImgGroup>\n',
		);

		expect(contexts(tree)).toEqual(['carousel', 'carousel']);
	});

	test('allows a full-bleed carousel', async () => {
		const tree = await transform(
			'<ImgGroup layout="carousel-full">\n  <Img src="a.jpg">A caption.</Img>\n  <Img src="b.jpg">B caption.</Img>\n</ImgGroup>\n',
		);

		expect(contexts(tree)).toEqual(['carousel', 'carousel']);
	});
});

const invalidCases: Array<[string, string, RegExp]> = [
	[
		'an unknown layout value',
		'<ImgGroup layout="masonry">\n  <Img src="a.jpg" />\n  <Img src="b.jpg" />\n</ImgGroup>\n',
		/must be one of carousel, carousel-full, carousel-wide, default, wide/,
	],
	[
		'columns on a carousel',
		'<ImgGroup layout="carousel" columns={3}>\n  <Img src="a.jpg" />\n  <Img src="b.jpg" />\n</ImgGroup>\n',
		/"columns" has no effect on a carousel/,
	],
	[
		'bare full on a group',
		'<ImgGroup layout="full">\n  <Img src="a.jpg" />\n  <Img src="b.jpg" />\n</ImgGroup>\n',
		/must be one of carousel, carousel-full, carousel-wide, default, wide/,
	],
	[
		'layout on a grouped image',
		'<ImgGroup>\n  <Img src="a.jpg" layout="wide">A caption.</Img>\n  <Img src="b.jpg" />\n</ImgGroup>\n',
		/"layout" has no effect inside an <ImgGroup>/,
	],
	['an empty group', '<ImgGroup></ImgGroup>\n', /contains no <Img> children/],
	[
		'a carousel with fewer than two images',
		'<ImgGroup layout="carousel">\n  <Img src="a.jpg">A caption.</Img>\n</ImgGroup>\n',
		/needs at least two images/,
	],
	[
		'a nested group',
		'<ImgGroup>\n  <ImgGroup>\n    <Img src="a.jpg" />\n    <Img src="b.jpg" />\n  </ImgGroup>\n</ImgGroup>\n',
		/may only contain <Img> children/,
	],
	[
		'prose inside a group',
		'<ImgGroup>\n  <Img src="a.jpg" />\n\n  Stray prose.\n\n  <Img src="b.jpg" />\n</ImgGroup>\n',
		/may only contain <Img> children/,
	],
	[
		'a non-image component inside a group',
		'<ImgGroup>\n  <Img src="a.jpg" />\n  <Link id="x">y</Link>\n</ImgGroup>\n',
		/may only contain <Img> children/,
	],
];

describe('rejects invalid markup', () => {
	for (const [label, input, message] of invalidCases) {
		test(label, async () => {
			await expect(transform(input)).rejects.toThrow(message);
		});
	}
});
