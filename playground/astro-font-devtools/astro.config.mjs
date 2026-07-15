import fontDevtools from '@xsynaptic/astro-font-devtools';
import { defineConfig } from 'astro/config';

export default defineConfig({
	integrations: [
		fontDevtools({
			providers: ['google', 'fontsource', 'bunny', 'fontshare'],
			targets: ['--font-heading', 'h1', 'p', 'code', '.additional-notes'],
		}),
	],
});
