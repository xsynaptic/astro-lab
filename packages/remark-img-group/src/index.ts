import type { Root } from 'mdast';
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx';
import type { Plugin, Transformer } from 'unified';

import { visit } from 'unist-util-visit';
import { z } from 'zod';

const optionsSchema = z.object({
	columnsAttributeName: z.string().default('columns'),
	contextAttributeName: z.string().default('context'),
	imageCountAttributeName: z.string().default('imageCount'),
	imgComponentId: z.string().default('Img'),
	imgGroupComponentId: z.string().default('ImgGroup'),
	layoutAttributeName: z.string().default('layout'),
});

type RemarkImgGroupOptions = z.input<typeof optionsSchema>;

const defaultLayoutId = 'default';
const validGroupLayouts = new Set([
	'carousel',
	'carousel-full',
	'carousel-wide',
	defaultLayoutId,
	'wide',
]);
const carouselLayouts = new Set(['carousel', 'carousel-full', 'carousel-wide']);

function getStringAttribute(node: MdxJsxFlowElement, name: string): string | undefined {
	const attribute = node.attributes.find(
		(attr): attr is MdxJsxAttribute => attr.type === 'mdxJsxAttribute' && attr.name === name,
	);

	return typeof attribute?.value === 'string' ? attribute.value : undefined;
}

function hasAttribute(node: MdxJsxFlowElement, name: string): boolean {
	return node.attributes.some((attr) => attr.type === 'mdxJsxAttribute' && attr.name === name);
}

function setStringAttribute(node: MdxJsxFlowElement, name: string, value: string): void {
	const attribute = node.attributes.find(
		(attr): attr is MdxJsxAttribute => attr.type === 'mdxJsxAttribute' && attr.name === name,
	);

	if (attribute) {
		attribute.value = value;
		return;
	}

	node.attributes.push({ name, type: 'mdxJsxAttribute', value });
}

// MDX renders inside-out, so a parent can't pass props to its children at render time
const remarkImgGroup = function (options?: null | Readonly<RemarkImgGroupOptions>) {
	const settings = optionsSchema.parse(options ?? {});

	const transformer: Transformer<Root> = (tree, file) => {
		visit(tree, 'mdxJsxFlowElement', (groupNode) => {
			if (groupNode.name !== settings.imgGroupComponentId) return;

			const layout = getStringAttribute(groupNode, settings.layoutAttributeName) ?? defaultLayoutId;

			if (!validGroupLayouts.has(layout)) {
				file.fail(
					`<ImgGroup> "${settings.layoutAttributeName}" must be one of ${[...validGroupLayouts].join(', ')}, received "${layout}"`,
					groupNode,
				);
			}

			const isCarousel = carouselLayouts.has(layout);

			if (isCarousel && hasAttribute(groupNode, settings.columnsAttributeName)) {
				file.fail(
					`<ImgGroup> "${settings.columnsAttributeName}" has no effect on a carousel`,
					groupNode,
				);
			}

			const context = isCarousel ? 'carousel' : 'grid';

			let imageCount = 0;

			for (const child of groupNode.children) {
				if (child.type === 'mdxJsxFlowElement' && child.name === settings.imgComponentId) {
					if (hasAttribute(child, settings.layoutAttributeName)) {
						file.fail(
							`<Img> "${settings.layoutAttributeName}" has no effect inside an <ImgGroup>; set it on the <ImgGroup> instead`,
							child,
						);
					}

					imageCount += 1;
					setStringAttribute(child, settings.contextAttributeName, context);

					continue;
				}

				file.fail(`<ImgGroup> may only contain <Img> children`, child);
			}

			if (imageCount === 0) {
				file.fail(`<ImgGroup> contains no <Img> children`, groupNode);
			}

			if (isCarousel && imageCount < 2) {
				file.fail(
					`<ImgGroup> carousel needs at least two images, found ${String(imageCount)}`,
					groupNode,
				);
			}

			setStringAttribute(groupNode, settings.imageCountAttributeName, String(imageCount));
		});
	};

	return transformer;
} satisfies Plugin<[(null | Readonly<RemarkImgGroupOptions> | undefined)?], Root>;

export type { RemarkImgGroupOptions };

export { remarkImgGroup };
