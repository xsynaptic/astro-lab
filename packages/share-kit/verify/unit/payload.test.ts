import { describe, expect, test } from 'vitest';

import { getDestinationLists, serializeShareKitPayload } from '../../src/payload.js';

describe('serializeShareKitPayload', () => {
	test('leaves no `<` to close the script element, and parses back unchanged', () => {
		const payload = {
			assets: [],
			locale: 'en',
			settings: { destinations: ['any'] as const },
			title: '</script><script>alert(1)</script>',
			url: 'https://example.com/',
		};
		const serialized = serializeShareKitPayload(payload);

		expect(serialized).not.toContain('<');
		expect(JSON.parse(serialized)).toEqual(payload);
	});
});

describe('getDestinationLists', () => {
	test('drops unknown and repeated ids, and anything already in the main row', () => {
		const lists = getDestinationLists(
			JSON.parse(
				'{"destinations":["x","x","nope","bluesky"],"destinationsMore":["bluesky","threads","threads"]}',
			),
		);

		expect(lists).toEqual({ main: ['x', 'bluesky'], more: ['threads'] });
	});

	test('falls back to Anywhere when nothing valid is left to select', () => {
		expect(getDestinationLists(JSON.parse('{"destinations":"x"}'))).toEqual({
			main: ['any'],
			more: [],
		});
	});
});

test('the entry imports where there is no DOM, as in server rendering', async () => {
	await expect(import('../../src/index.js')).resolves.toHaveProperty('defineShareKit');
});
