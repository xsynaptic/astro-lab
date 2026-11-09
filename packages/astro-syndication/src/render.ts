import type { AddServerRenderer, ContainerRenderOptions } from 'astro/container';

import { experimental_AstroContainer as AstroContainer } from 'astro/container';

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace -- merging into Astro's `App` namespace needs one
	namespace App {
		interface Locals {
			isFeed?: boolean;
		}
	}
}

export async function createSyndicationRenderer({
	renderers = [],
	site,
}: {
	renderers?: Array<AddServerRenderer>;
	site: URL;
}) {
	// A container has no `Astro.site` unless its config sets one
	const container = await AstroContainer.create({ astroConfig: { site: site.href } });

	for (const renderer of renderers) {
		container.addServerRenderer(renderer);
	}

	return function render(
		component: Parameters<AstroContainer['renderToString']>[0],
		{ locals, props }: Pick<ContainerRenderOptions, 'locals' | 'props'> = {},
	) {
		return container.renderToString(component, {
			locals: { ...locals, isFeed: true },
			...(props ? { props } : {}),
		});
	};
}
