import { stripVTControlCharacters } from 'node:util';
import { describe, expect, test } from 'vitest';

import type { OutputEvent } from '../src/output/events.js';
import type { Validation } from '../src/validation.js';

import { captureOutput } from '../src/output/output.js';
import {
	reportValidationResult,
	runValidations,
	toReferenceValidationResult,
} from '../src/validation.js';

function renderData(events: Array<OutputEvent>) {
	return events.flatMap((event) =>
		event.type === 'data' && event.render ? [stripVTControlCharacters(event.render())] : [],
	);
}

async function getRejection(task: () => Promise<unknown>) {
	try {
		await task();
	} catch (error) {
		return error;
	}

	throw new Error('Expected the run to fail');
}

function passing(name: string): Validation {
	return { name, run: () => ({ issues: [], status: 'pass', summary: `${name} ok` }) };
}

function failing(name: string): Validation {
	return {
		name,
		run: () => Promise.resolve({ issues: [{ message: 'broken' }], status: 'fail', summary: name }),
	};
}

describe('reportValidationResult', () => {
	test('renders the pass summary, then any notes', async () => {
		const { events } = await captureOutput(() => {
			reportValidationResult({
				issues: [],
				notes: ['   2  3:2'],
				status: 'pass',
				summary: '2 image aspect ratios valid',
			});
		});

		expect(renderData(events)).toEqual(['✓ 2 image aspect ratios valid\n     2  3:2']);
	});

	test('renders located issues above a failing summary, with details indented', async () => {
		const { events } = await captureOutput(() => {
			reportValidationResult({
				issues: [
					{
						details: ['Line 3: broken link ID "missing"'],
						location: 'a-post.mdx',
						message: '1 broken link ID',
					},
				],
				status: 'fail',
				summary: 'Found 1 broken link ID(s)',
			});
		});

		expect(renderData(events)).toEqual([
			[
				'✗ a-post.mdx: 1 broken link ID',
				'  Line 3: broken link ID "missing"',
				'✗ Found 1 broken link ID(s)',
			].join('\n'),
		]);
	});

	test('marks advisory issues and their summary as warnings', async () => {
		const { events } = await captureOutput(() => {
			reportValidationResult({
				issues: [{ message: 'a: overlaps b (3.0m)' }],
				status: 'warn',
				summary: 'Found 1 overlap(s)',
			});
		});

		expect(renderData(events)).toEqual(['⚠ a: overlaps b (3.0m)\n⚠ Found 1 overlap(s)']);
	});
});

describe('toReferenceValidationResult', () => {
	test('keeps the location as a field for structured output', () => {
		const result = toReferenceValidationResult(
			[{ collection: 'regions', field: 'regions', id: 'taipei', location: 'posts/a-post' }],
			{ fail: 'Broken references', pass: 'References valid' },
		);

		expect(result.issues).toEqual([
			{
				location: 'posts/a-post',
				message: 'regions references "taipei", missing from "regions"',
			},
		]);
	});
});

describe('runValidations', () => {
	test('reports every check as named data, sync or async, and fails a full run on any failure', async () => {
		const { events, result } = await captureOutput(() =>
			getRejection(() =>
				runValidations([passing('entry-ids'), failing('references'), passing('mdx')]),
			),
		);

		expect(events.map((event) => (event.type === 'data' ? event.value : event.type))).toMatchObject(
			[
				{ name: 'entry-ids', status: 'pass' },
				{ issues: [{ message: 'broken' }], name: 'references', status: 'fail' },
				{ name: 'mdx', status: 'pass' },
			],
		);
		expect(result).toMatchObject({ message: '1 of 3 checks failed', name: 'UserError' });
	});

	test('runs one check by name for inspection without failing the run', async () => {
		const { events } = await captureOutput(() =>
			runValidations([passing('entry-ids'), failing('references')], { only: 'references' }),
		);

		expect(events).toMatchObject([{ type: 'data', value: { name: 'references' } }]);
	});

	test('rejects an unknown check, naming the choices', async () => {
		await expect(
			runValidations([passing('entry-ids'), passing('mdx')], { only: 'mxd' }),
		).rejects.toMatchObject({ message: 'Unknown check "mxd"; choose from entry-ids, mdx' });
	});

	test('stops between checks once the signal aborts', async () => {
		const controller = new AbortController();
		const stopping: Validation = {
			name: 'entry-ids',
			run: () => {
				controller.abort();

				return { issues: [], status: 'pass', summary: 'ok' };
			},
		};

		const { events, result } = await captureOutput(() =>
			getRejection(() =>
				runValidations([stopping, failing('references')], { signal: controller.signal }),
			),
		);

		expect(events).toHaveLength(1);
		expect(result).toMatchObject({ name: 'AbortError' });
	});
});
