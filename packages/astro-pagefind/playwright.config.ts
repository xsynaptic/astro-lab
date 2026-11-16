import { definePlaygroundConfig } from '../../playwright.base.ts';

// Dev serves no index until a build has written one
export default definePlaygroundConfig({
	base: '/lab/',
	playground: 'astro-pagefind',
	port: 4333,
	server: 'preview',
});
