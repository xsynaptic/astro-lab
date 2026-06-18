import type { MdastNode, MdastPluginInput, MdxJsxAttributeUnion, MdxJsxFlowElement } from 'satteri';

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

// Sätteri diagnostics don't block or reach the caller, so authoring mistakes throw to fail the build
function fail(
	ctx: { readonly fileURL: undefined | URL },
	node: Readonly<MdastNode>,
	message: string,
): never {
	const start = node.position?.start;
	const file = ctx.fileURL ? `${ctx.fileURL.pathname}:` : '';
	const location = start ? ` (${file}${String(start.line)}:${String(start.column)})` : '';

	throw new Error(`${message}${location}`);
}

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
				fail(
					ctx,
					groupNode,
					`<ImgGroup> "${settings.layoutAttributeName}" must be one of ${[...validGroupLayouts].join(', ')}, received "${layout}"`,
				);
			}

			const isCarousel = carouselLayouts.has(layout);

			if (isCarousel && hasAttribute(groupNode, settings.columnsAttributeName)) {
				fail(
					ctx,
					groupNode,
					`<ImgGroup> "${settings.columnsAttributeName}" has no effect on a carousel`,
				);
			}

			const context = isCarousel ? 'carousel' : 'grid';

			let imageCount = 0;

			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Sätteri materializes an empty element's children as undefined, not []
			const sourceChildren = groupNode.children ?? [];

			// Sätteri rejects setProperty on the structured `attributes` array
			// Rebuild the subtree and return it; Sätteri swaps the visited node for the returned one
			const children = sourceChildren.map((child) => {
				if (child.type !== 'mdxJsxFlowElement' || child.name !== settings.imgComponentId) {
					fail(ctx, child, `<ImgGroup> may only contain <Img> children`);
				}

				if (hasAttribute(child, settings.layoutAttributeName)) {
					fail(
						ctx,
						child,
						`<Img> "${settings.layoutAttributeName}" has no effect inside an <ImgGroup>; set it on the <ImgGroup> instead`,
					);
				}

				imageCount += 1;

				return {
					...child,
					attributes: withStringAttribute(child.attributes, settings.contextAttributeName, context),
				};
			});

			if (imageCount === 0) {
				fail(ctx, groupNode, `<ImgGroup> contains no <Img> children`);
			}

			if (isCarousel && imageCount < 2) {
				fail(
					ctx,
					groupNode,
					`<ImgGroup> carousel needs at least two images, found ${String(imageCount)}`,
				);
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
	const isPresent = attributes.some(
		(attr) => attr.type === 'mdxJsxAttribute' && attr.name === name,
	);

	const next = attributes.map((attr): MdxJsxAttributeUnion => {
		if (attr.type === 'mdxJsxAttribute' && attr.name === name) {
			return { name, type: 'mdxJsxAttribute', value };
		}
		return attr;
	});

	if (!isPresent) {
		next.push({ name, type: 'mdxJsxAttribute', value });
	}

	return next;
}

export type { ImgGroupSatteriOptions };

export { imgGroupSatteriPlugin };
