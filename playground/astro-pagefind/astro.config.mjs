import pagefind from '@xsynaptic/astro-pagefind';
import { defineConfig } from 'astro/config';

export default defineConfig({
	base: '/lab',
	integrations: [pagefind({ indexConfig: { excludeSelectors: ['[data-footnote-backref]'] } })],
});
