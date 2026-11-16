import type { CardRenderOptions } from '@xsynaptic/astro-image-pipeline/node';

import { render } from 'takumi-js';

import { cardSizes } from '../lib/sample-page.js';

const titleSizes = {
	landscape: 72,
	portrait: 96,
	story: 112,
} as const;

const sampleDomain = 'example.com';

function isCardVariant(value: unknown): value is keyof typeof cardSizes {
	return typeof value === 'string' && Object.hasOwn(cardSizes, value);
}

function getCardHtml(title: string, variant: keyof typeof cardSizes) {
	return `<div style="display: flex; flex-direction: column; justify-content: space-between; width: 100%; height: 100%; padding: 72px; background-image: linear-gradient(160deg, #0b3d4f, #2a9d8f); color: #fff;">
		<div style="display: flex; font-size: 32px; letter-spacing: 4px; text-transform: uppercase; opacity: 0.8;">${variant} card</div>
		<div style="display: flex; flex-direction: column; gap: 24px;">
			<div style="display: flex; font-size: ${String(titleSizes[variant])}px; font-weight: 700; line-height: 1.1;">${title}</div>
			<div style="display: flex; font-size: 32px; opacity: 0.8;">${sampleDomain}</div>
		</div>
	</div>`;
}

export default {
	decode: () => Promise.resolve(),
	render: async ({ title, variant }) => {
		if (typeof title !== 'string' || !isCardVariant(variant)) {
			throw new TypeError('A playground card needs a title and a variant');
		}

		return render(getCardHtml(title, variant), {
			format: 'jpeg',
			quality: 85,
			...cardSizes[variant],
		});
	},
} satisfies Pick<CardRenderOptions<undefined>, 'decode' | 'render'>;
