import { expect, test } from 'vitest';

import { createUmamiAttributes } from '../../src/umami.js';

function createFakeElement(initial: Record<string, string>) {
	const attributes = new Map(Object.entries(initial));
	const element = {
		getAttributeNames: () => [...attributes.keys()],
		removeAttribute: (name: string) => {
			attributes.delete(name);
		},
		setAttribute: (name: string, value: string) => {
			attributes.set(name, value);
		},
	} satisfies Pick<Element, 'getAttributeNames' | 'removeAttribute' | 'setAttribute'>;

	return { attributes, element: element as unknown as Element };
}

test('updating attributes drops a key the new payload lacks, and leaves unrelated ones', () => {
	const { setSendEventAttributes } = createUmamiAttributes<{
		'mode-toggle': undefined | { mode: string };
	}>();
	const { attributes, element } = createFakeElement({ class: 'toggle' });

	setSendEventAttributes(element, 'mode-toggle', { mode: 'dark' });
	setSendEventAttributes(element, 'mode-toggle');

	expect(Object.fromEntries(attributes)).toEqual({
		class: 'toggle',
		'data-umami-event': 'mode-toggle',
	});
});
