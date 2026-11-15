import imagePipeline from '@xsynaptic/astro-image-pipeline';
import { defineConfig } from 'astro/config';

export default defineConfig({
	integrations: [
		imagePipeline({
			baseUrl: '/images',
			mediaPath: 'media',
			storePath: 'image-store',
		}),
	],
});
