import type { Page } from '@playwright/test';

import type { EventMap } from './index.js';

interface SentEvent<Events, Name extends keyof Events> {
	data: Events[Name];
	name: Name;
}

async function stubUmami(page: Page) {
	await page.addInitScript(() => {
		const sentEvents: Array<{ data: unknown; name: string }> = [];

		Object.assign(globalThis, {
			sentEvents,
			umami: {
				track: (name: string, data: unknown) => {
					sentEvents.push({ data, name });
				},
			},
		});
	});
}

export function createUmamiStub<Events extends EventMap<Events>>() {
	function getSentEvents<Name extends keyof Events & string>(page: Page, name: Name) {
		return page.evaluate(
			(eventName) =>
				(
					(globalThis as { sentEvents?: Array<SentEvent<Events, keyof Events>> }).sentEvents ?? []
				).filter((event): event is SentEvent<Events, Name> => event.name === eventName),
			name,
		);
	}

	return { getSentEvents, stubUmami };
}
