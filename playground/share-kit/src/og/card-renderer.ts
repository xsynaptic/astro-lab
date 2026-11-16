import type { CardRenderOptions } from '@xsynaptic/astro-image-pipeline/node';
import type { ShareKitImageFormat } from '@xsynaptic/share-kit';

import { render } from 'takumi-js';

import { cardFormats } from '../lib/sample-page.js';

const titleSizes: Partial<Record<string, number>> = {
	landscape: 72,
	pin: 104,
	portrait: 96,
	story: 112,
};

const defaultTitleSize = 96;

const sampleDomain = 'example.com';

function getCardHtml(title: string, { id: variant }: ShareKitImageFormat) {
	return `<div style="display: flex; flex-direction: column; justify-content: space-between; width: 100%; height: 100%; padding: 72px; background-image: linear-gradient(160deg, #0b3d4f, #2a9d8f); color: #fff;">
		<div style="display: flex; font-size: 32px; letter-spacing: 4px; text-transform: uppercase; opacity: 0.8;">${variant} card</div>
		<div style="display: flex; flex-direction: column; gap: 24px;">
			<div style="display: flex; font-size: ${String(titleSizes[variant] ?? defaultTitleSize)}px; font-weight: 700; line-height: 1.1;">${title}</div>
			<div style="display: flex; font-size: 32px; opacity: 0.8;">${sampleDomain}</div>
		</div>
	</div>`;
}

export default {
	decode: () => Promise.resolve(),
	render: async ({ title, variant }) => {
		const format = cardFormats.find(({ id }) => id === variant);

		if (typeof title !== 'string' || !format) {
			throw new TypeError('A playground card needs a title and a variant');
		}

		return render(getCardHtml(title, format), {
			format: 'jpeg',
			height: format.height,
			quality: 85,
			width: format.width,
		});
	},
} satisfies Pick<CardRenderOptions<undefined>, 'decode' | 'render'>;
