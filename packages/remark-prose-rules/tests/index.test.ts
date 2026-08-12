import type { VFileMessage } from 'vfile-message';

import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { describe, expect, test } from 'vitest';

import type { RemarkProseRulesOptions } from '../src/index.js';

import { remarkProseRules } from '../src/index.js';

interface Result {
	messages: Array<VFileMessage>;
	value: string;
}

async function run(
	input: string,
	options?: RemarkProseRulesOptions,
	shouldFixTerms = false,
): Promise<Result> {
	const processor = unified().use(remarkParse).use(remarkMdx);

	if (shouldFixTerms) processor.data('editorialFixes', true);

	const file = await processor.use(remarkProseRules(options)).use(remarkStringify).process(input);

	return { messages: file.messages, value: String(file) };
}

const terms: RemarkProseRulesOptions['terms'] = [
	['postwar', 'post-war'],
	['metre', 'meter'],
	['[Kk][ōo]minka', 'Kōminka'],
];

const numberRange = {
	message: 'Use `--` (renders en-dash) for number ranges instead of a hyphen',
	pattern: String.raw`(\d)-(\d)`,
	replace: '$1--$2',
};

describe('words', () => {
	test('leaves clean prose untouched', async () => {
		const { messages, value } = await run('A visit to the café in Québec.');

		expect(value).toBe('A visit to the café in Québec.\n');
		expect(messages).toHaveLength(0);
	});

	test('corrects every occurrence, keeping the original casing', async () => {
		const { messages, value } = await run('Cafe and CAFE and cafe.');

		expect(value).toBe('Café and CAFÉ and café.\n');
		expect(messages).toHaveLength(3);
		expect(messages[0]?.reason).toBe('Incorrect usage of the word: “Cafe”, use “Café” instead');
		expect(messages[0]?.expected).toEqual(['Café']);
	});

	test('accepts extra words alongside the built-in list', async () => {
		const { value } = await run('The manana meeting and the cafe.', { words: ['mañana'] });

		expect(value).toBe('The mañana meeting and the café.\n');
	});

	// Marks outside the built-in groups cannot be derived
	// Those corrections belong in `terms` instead
	test('cannot derive a mark it has no group for', async () => {
		const { messages } = await run('The kominka period.', { words: ['kōminka'] });

		expect(messages).toHaveLength(0);
	});

	test('reaches headings, link text, and JSX children', async () => {
		const { value } = await run(
			['# The cafe', '', '[a cafe](/cafe)', '', '<Link>a cafe</Link>'].join('\n'),
		);

		expect(value).toContain('# The café');
		expect(value).toContain('[a café](/cafe)');
		expect(value).toContain('<Link>a café</Link>');
	});

	test('leaves inline code and code blocks alone', async () => {
		const { messages, value } = await run(['`cafe`', '', '```', 'cafe', '```'].join('\n'));

		expect(value).toContain('`cafe`');
		expect(value).toContain('\ncafe\n');
		expect(messages).toHaveLength(0);
	});

	test('leaves JSX attribute values alone', async () => {
		const { messages, value } = await run('<Link title="a cafe" href="/cafe">ok</Link>');

		expect(value).toContain('title="a cafe"');
		expect(messages).toHaveLength(0);
	});
});

describe('terms', () => {
	test('replaces literally rather than matching the original casing', async () => {
		const { value } = await run('The Metre and the metre.', { terms }, true);

		expect(value).toBe('The meter and the meter.\n');
	});

	test('capitalizes at the start of a sentence when the original was capitalized', async () => {
		const { value } = await run('Metre is a unit. Metre again.', { terms }, true);

		expect(value).toBe('Meter is a unit. Meter again.\n');
	});

	test('does not capitalize a lowercase match at the start of a sentence', async () => {
		const { value } = await run('metre is a unit.', { terms }, true);

		expect(value).toBe('meter is a unit.\n');
	});

	test('ignores hyphen-adjacent occurrences', async () => {
		const { messages, value } = await run('The postwar-era building.', { terms }, true);

		expect(value).toBe('The postwar-era building.\n');
		expect(messages).toHaveLength(0);
	});

	test('matches at the end of a string and before punctuation', async () => {
		const { value } = await run('It was postwar, and still postwar', { terms }, true);

		expect(value).toBe('It was post-war, and still post-war\n');
	});

	test('applies a bracket-class pattern', async () => {
		const { value } = await run('The kominka period.', { terms }, true);

		expect(value).toBe('The Kōminka period.\n');
	});

	test('reports without rewriting unless editorial fixes are enabled', async () => {
		const { messages, value } = await run('The metre.', { terms });

		expect(value).toBe('The metre.\n');
		expect(messages).toHaveLength(1);
		expect(messages[0]?.reason).toBe('Incorrect term: “metre”, use “meter” instead');
		expect(messages[0]?.expected).toEqual(['meter']);
	});

	test('escapes markdown-significant characters in a replacement', async () => {
		const { value } = await run('The gate.', { terms: [['gate', '*gate*']] }, true);

		expect(value).toBe('The \\*gate\\*.\n');
	});
});

describe('patterns', () => {
	test('rewrites a number range', async () => {
		const { messages, value } = await run('Built 1930-1945 in Taiwan.', {
			patterns: [numberRange],
		});

		expect(value).toBe('Built 1930--1945 in Taiwan.\n');
		expect(messages[0]?.reason).toBe(numberRange.message);
	});

	test('leaves an already-correct range alone', async () => {
		const { messages, value } = await run('Built 1930--1945.', { patterns: [numberRange] });

		expect(value).toBe('Built 1930--1945.\n');
		expect(messages).toHaveLength(0);
	});
});

describe('skip', () => {
	test('skips every rule inside a blockquote', async () => {
		const { messages, value } = await run('> A cafe in 1930-1945 was postwar.', {
			patterns: [numberRange],
			terms,
		});

		expect(value).toBe('> A cafe in 1930-1945 was postwar.\n');
		expect(messages).toHaveLength(0);
	});

	test('honours a custom skip list', async () => {
		const { value } = await run('# The cafe\n\nThe cafe.', { skip: ['heading'] });

		expect(value).toContain('# The cafe');
		expect(value).toContain('The café.');
	});
});

describe('messages', () => {
	test('points at the matched span, not the whole node', async () => {
		const { messages } = await run('A visit to the cafe today.');
		const place = messages[0]?.place;

		expect(place && 'start' in place ? place.start.column : undefined).toBe(16);
		expect(place && 'end' in place ? place.end.column : undefined).toBe(20);
	});

	// A backslash escape shifts text-node offsets out of step with the source
	// The range falls back to the node rather than pointing somewhere wrong
	test('falls back to the node when an escape shifts the offsets', async () => {
		const { messages, value } = await run(String.raw`A \* and a cafe.`);
		const place = messages[0]?.place;

		expect(place && 'start' in place ? place.start.column : undefined).toBe(1);
		expect(place && 'end' in place ? place.end.column : undefined).toBe(17);
		expect(value).toContain('café');
	});

	// Without overlap resolution the two spans would splice on top of each other
	test('drops a rule that overlaps an earlier match', async () => {
		const { messages, value } = await run(
			'A cafe here.',
			{ terms: [['cafe', 'coffee shop']] },
			true,
		);

		expect(value).toBe('A café here.\n');
		expect(messages).toHaveLength(1);
	});
});
