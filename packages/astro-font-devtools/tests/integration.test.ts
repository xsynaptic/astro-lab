import type { AstroIntegration } from 'astro';

import { describe, expect, it } from 'vitest';

import fontDevtools from '../src/integration.js';

type ConfigSetup = NonNullable<AstroIntegration['hooks']['astro:config:setup']>;
type SetupArg = Parameters<ConfigSetup>[0];

function countRegisteredApps(command: SetupArg['command']) {
	let addedApps = 0;
	const context = {
		addDevToolbarApp: () => {
			addedApps += 1;
		},
		command,
	};
	const setup = fontDevtools().hooks['astro:config:setup'];
	if (!setup) throw new Error('astro:config:setup hook is missing');

	void setup(context as unknown as SetupArg);

	return addedApps;
}

describe('fontDevtools', () => {
	it('registers the toolbar in dev', () => {
		expect(countRegisteredApps('dev')).toBe(1);
	});

	it('does nothing outside dev', () => {
		expect(countRegisteredApps('build')).toBe(0);
	});
});
