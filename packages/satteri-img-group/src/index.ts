import type { MdastPluginInput, MdxJsxAttributeUnion, MdxJsxFlowElement } from 'satteri';

import { defineMdastPlugin } from 'satteri';
import { z } from 'zod';

const optionsSchema = z.object({
	columnsAttributeName: z.string().default('columns'),
	contextAttributeName: z.string().default('context'),
	imageCountAttributeName: z.string().default('imageCount'),
	imgComponentId: z.string().default('Img'),
	imgGroupComponentId: z.string().default('ImgGroup'),
	layoutAttributeName: z.string().default('layout'),
});

type ImgGroupSatteriOptions = z.input<typeof optionsSchema>;

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
		(attr) => attr.type === 'mdxJsxAttribute' && attr.name === name,
	);

	return attribute?.type === 'mdxJsxAttribute' && typeof attribute.value === 'string'
		? attribute.value
		: undefined;
}

function hasAttribute(node: MdxJsxFlowElement, name: string): boolean {
	return node.attributes.some((attr) => attr.type === 'mdxJsxAttribute' && attr.name === name);
}

// MDX renders inside-out, so a parent can't pass props to its children at render time
function imgGroupSatteriPlugin(
	options?: null | Readonly<ImgGroupSatteriOptions>,
): MdastPluginInput {
	const settings = optionsSchema.parse(options ?? {});

	return defineMdastPlugin({
		mdxJsxFlowElement(groupNode, ctx) {
			if (groupNode.name !== settings.imgGroupComponentId) return;

			const layout = getStringAttribute(groupNode, settings.layoutAttributeName) ?? defaultLayoutId;

			if (!validGroupLayouts.has(layout)) {
				ctx.report({
					message: `<ImgGroup> "${settings.layoutAttributeName}" must be one of ${[...validGroupLayouts].join(', ')}, received "${layout}"`,
					node: groupNode,
					severity: 'error',
				});
			}

			const isCarousel = carouselLayouts.has(layout);

			if (isCarousel && hasAttribute(groupNode, settings.columnsAttributeName)) {
				ctx.report({
					message: `<ImgGroup> "${settings.columnsAttributeName}" has no effect on a carousel`,
					node: groupNode,
					severity: 'error',
				});
			}

			const context = isCarousel ? 'carousel' : 'grid';

			let imageCount = 0;

			// Sätteri rejects setProperty on the structured `attributes` array
			// Rebuild the subtree and return it; satteri swaps the visited node for the returned one
			const children = groupNode.children.map((child) => {
				if (child.type === 'mdxJsxFlowElement' && child.name === settings.imgComponentId) {
					if (hasAttribute(child, settings.layoutAttributeName)) {
						ctx.report({
							message: `<Img> "${settings.layoutAttributeName}" has no effect inside an <ImgGroup>; set it on the <ImgGroup> instead`,
							node: child,
							severity: 'error',
						});
					}

					imageCount += 1;

					return {
						...child,
						attributes: withStringAttribute(
							child.attributes,
							settings.contextAttributeName,
							context,
						),
					};
				}

				ctx.report({
					message: `<ImgGroup> may only contain <Img> children`,
					node: child,
					severity: 'error',
				});

				return child;
			});

			if (imageCount === 0) {
				ctx.report({
					message: `<ImgGroup> contains no <Img> children`,
					node: groupNode,
					severity: 'error',
				});
			}

			if (isCarousel && imageCount < 2) {
				ctx.report({
					message: `<ImgGroup> carousel needs at least two images, found ${String(imageCount)}`,
					node: groupNode,
					severity: 'error',
				});
			}

			return {
				...groupNode,
				attributes: withStringAttribute(
					groupNode.attributes,
					settings.imageCountAttributeName,
					String(imageCount),
				),
				children,
			};
		},
		name: 'img-group',
	});
}

// Sätteri has no in-place attribute mutation, so rebuild the array and return it immutably
function withStringAttribute(
	attributes: ReadonlyArray<MdxJsxAttributeUnion>,
	name: string,
	value: string,
): Array<MdxJsxAttributeUnion> {
	const present = attributes.some((attr) => attr.type === 'mdxJsxAttribute' && attr.name === name);

	const next = attributes.map((attr): MdxJsxAttributeUnion => {
		if (attr.type === 'mdxJsxAttribute' && attr.name === name) {
			return { name, type: 'mdxJsxAttribute', value };
		}
		return attr;
	});

	if (!present) {
		next.push({ name, type: 'mdxJsxAttribute', value });
	}

	return next;
}

export type { ImgGroupSatteriOptions };

export { imgGroupSatteriPlugin };
