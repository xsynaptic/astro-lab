import imagePipeline from '@xsynaptic/astro-image-pipeline';
import { defineConfig } from 'astro/config';

export default defineConfig({
	integrations: [
		imagePipeline({
			baseUrl: '/images',
			cards: { renderer: './src/og/card-renderer.ts', route: '/og/' },
			mediaPath: 'media',
			storePath: 'image-store',
		}),
	],
});
