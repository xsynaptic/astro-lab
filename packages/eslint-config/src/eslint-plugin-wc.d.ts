declare module 'eslint-plugin-wc' {
	import type { ConfigWithExtends } from '@eslint/config-helpers';

	export const configs: Record<string, ConfigWithExtends>;
}
