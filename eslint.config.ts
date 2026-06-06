import { getConfig } from '@xsynaptic/eslint-config';
import tseslint from 'typescript-eslint';

export default getConfig([
	{
		ignores: ['**/dist/**', '**/node_modules/**', 'playground/**'],
	},
	{
		files: ['**/*.config.{ts,mts,mjs,js}', '**/test/**', '**/tests/**', '**/__tests__/**'],
		...tseslint.configs.disableTypeChecked,
	},
]);
