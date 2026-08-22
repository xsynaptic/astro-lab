import type {
	MdastNode,
	MdastPluginDefinition,
	MdxJsxAttributeUnion,
	MdxJsxFlowElement,
} from 'satteri';

import { defineMdastPlugin } from 'satteri';
import { z } from 'zod';

const contextSchema = z.object({
	disallowedAttributes: z.array(z.string()).default([]),
	minImages: z.number().int().min(1).default(1),
});

const optionsSchema = z
	.object({
		contextAttributeName: z.string().default('context'),
		contexts: z.record(z.string(), contextSchema),
		defaultContext: z.string(),
		imageCountAttributeName: z.string().default('imageCount'),
		imgComponentId: z.string().default('Img'),
		imgGroupComponentId: z.string().default('ImgGroup'),
		layoutAttributeName: z.string().default('layout'),
		layouts: z.array(z.string()),
	})
	.refine((value) => Object.hasOwn(value.contexts, value.defaultContext), {
		error: '"defaultContext" must be a key of "contexts"',
		path: ['defaultContext'],
	});

type ImgGroupSatteriOptions = z.input<typeof optionsSchema>;

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
function imgGroupSatteriPlugin(options: Readonly<ImgGroupSatteriOptions>): MdastPluginDefinition {
	const settings = optionsSchema.parse(options);

	return defineMdastPlugin({
		mdxJsxFlowElement(groupNode, ctx) {
			if (groupNode.name !== settings.imgGroupComponentId) return;

			const contextName =
				getStringAttribute(groupNode, settings.contextAttributeName) ?? settings.defaultContext;
			const context = settings.contexts[contextName];

			if (!context) {
				fail(
					ctx,
					groupNode,
					`<ImgGroup> "${settings.contextAttributeName}" must be one of ${Object.keys(
						settings.contexts,
					)
						.toSorted((left, right) => left.localeCompare(right))
						.join(', ')}, received "${contextName}"`,
				);
			}

			const layout = getStringAttribute(groupNode, settings.layoutAttributeName);

			if (layout !== undefined && !settings.layouts.includes(layout)) {
				fail(
					ctx,
					groupNode,
					`<ImgGroup> "${settings.layoutAttributeName}" must be one of ${settings.layouts.join(', ')}, received "${layout}"`,
				);
			}

			for (const attributeName of context.disallowedAttributes) {
				if (hasAttribute(groupNode, attributeName)) {
					fail(ctx, groupNode, `<ImgGroup> "${attributeName}" has no effect on ${contextName}`);
				}
			}

			let imageCount = 0;

			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Sätteri materializes an empty element's children as undefined, not []
			const sourceChildren = groupNode.children ?? [];

			// Sätteri rejects setProperty on the structured `attributes` array
			// Rebuild the subtree and return it; Sätteri swaps the visited node for the returned one
			const children = sourceChildren.map((child) => {
				if (child.type !== 'mdxJsxFlowElement' || child.name !== settings.imgComponentId) {
					fail(ctx, child, `<ImgGroup> may only contain <Img> children`);
				}

				for (const attributeName of [settings.contextAttributeName, settings.layoutAttributeName]) {
					if (hasAttribute(child, attributeName)) {
						fail(
							ctx,
							child,
							`<Img> "${attributeName}" has no effect inside an <ImgGroup>; set it on the <ImgGroup> instead`,
						);
					}
				}

				imageCount += 1;

				return {
					...child,
					attributes: withStringAttribute(
						child.attributes,
						settings.contextAttributeName,
						contextName,
					),
				};
			});

			if (imageCount === 0) {
				fail(ctx, groupNode, `<ImgGroup> contains no <Img> children`);
			}

			if (imageCount < context.minImages) {
				fail(
					ctx,
					groupNode,
					`<ImgGroup> ${contextName} needs at least ${String(context.minImages)} images, found ${String(imageCount)}`,
				);
			}

			return {
				...groupNode,
				attributes: withStringAttribute(
					withStringAttribute(
						groupNode.attributes,
						settings.imageCountAttributeName,
						String(imageCount),
					),
					settings.contextAttributeName,
					contextName,
				),
				children,
			};
		},
		name: 'img-group',
		// Sätteri skips position tracking unless a plugin opts in
		options: { position: true },
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
