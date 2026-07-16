import { markdownToHtml, mdxToJs } from 'satteri';
import { describe, expect, test } from 'vitest';

import type { ReadingTimeOptions } from '../src/index.js';

import { readingTime } from '../src/index.js';

interface AstroData {
	[key: string]: unknown;
	astro: { frontmatter: Record<string, unknown> };
}

// Mirror the Astro processor: seed data.astro.frontmatter, read the injected value back
async function readMinutes(
	source: string,
	options?: Readonly<ReadingTimeOptions>,
	key = 'minutesRead',
): Promise<unknown> {
	const data: AstroData = { astro: { frontmatter: {} } };
	await markdownToHtml(source, { data, mdastPlugins: [readingTime(options)] });
	return data.astro.frontmatter[key];
}

async function readMinutesMdx(
	source: string,
	options?: Readonly<ReadingTimeOptions>,
): Promise<unknown> {
	const data: AstroData = { astro: { frontmatter: {} } };
	await mdxToJs(source, {
		data,
		fileURL: new URL('file:///test.mdx'),
		mdastPlugins: [readingTime(options)],
	});
	return data.astro.frontmatter.minutesRead;
}

describe('readingTime', () => {
	test('does not throw when called with no options', () => {
		expect(() => readingTime()).not.toThrow();
	});

	test('counts English prose at latinWpm', async () => {
		// 400 words at 200 wpm => 2 minutes
		const source = Array.from({ length: 400 }, () => 'word').join(' ');
		expect(await readMinutes(source)).toBe(2);
	});

	test('short prose rounds up to a 1-minute floor via ceil', async () => {
		expect(await readMinutes('just a few words here')).toBe(1);
	});

	test('counts CJK at scriptCharPerMinute', async () => {
		// 300 Han characters at 300 cpm => 1 minute
		const source = '中'.repeat(300);
		expect(await readMinutes(source)).toBe(1);
	});

	test('adds Latin and CJK minutes', async () => {
		const latin = Array.from({ length: 200 }, () => 'word').join(' '); // 1 min
		const cjk = '中'.repeat(300); // 1 min
		expect(await readMinutes(`${latin}\n\n${cjk}`)).toBe(2);
	});

	test('respects a custom frontmatterKey', async () => {
		const source = Array.from({ length: 400 }, () => 'word').join(' ');
		expect(await readMinutes(source, { frontmatterKey: 'readTime' }, 'readTime')).toBe(2);
	});

	test('respects a custom latinWpm', async () => {
		const source = Array.from({ length: 400 }, () => 'word').join(' ');
		// 400 words at 400 wpm => 1 minute
		expect(await readMinutes(source, { latinWpm: 400 })).toBe(1);
	});

	test('respects a custom scriptCharPerMinute', async () => {
		const source = '中'.repeat(600);
		// 600 CJK chars at 600 cpm => 1 minute (default 300 cpm would be 2)
		expect(await readMinutes(source, { scriptCharPerMinute: 600 })).toBe(1);
	});

	test('counts inline code', async () => {
		// 400 inline-code spans, no prose; if inline code counts => ceil(400/200) = 2
		const source = Array.from({ length: 400 }, () => '`code`').join(' ');
		expect(await readMinutes(source)).toBe(2);
	});

	test('excludes fenced code by default', async () => {
		const prose = Array.from({ length: 200 }, () => 'word').join(' '); // 1 min
		const code = ['```js', Array.from({ length: 400 }, () => 'noise').join(' '), '```'].join('\n');
		expect(await readMinutes(`${prose}\n\n${code}`)).toBe(1);
	});

	test('includes fenced code when countCodeBlocks is enabled', async () => {
		const prose = Array.from({ length: 200 }, () => 'word').join(' '); // 200 words
		const code = ['```js', Array.from({ length: 200 }, () => 'noise').join(' '), '```'].join('\n'); // 200 words
		// 400 words at 200 wpm => 2 minutes
		expect(await readMinutes(`${prose}\n\n${code}`, { countCodeBlocks: true })).toBe(2);
	});

	test('excludes raw HTML markup from the count', async () => {
		const prose = Array.from({ length: 200 }, () => 'word').join(' '); // 1 min
		// The <div> tags must not add to the count
		expect(await readMinutes(`<div>\n\n${prose}\n\n</div>`)).toBe(1);
	});

	test('leaves the key absent for a frontmatter-only document', async () => {
		expect(await readMinutes('---\ntitle: Only Frontmatter\n---\n')).toBeUndefined();
	});

	test('writes to the data bag when Astro frontmatter is absent (standalone use)', async () => {
		const data: Record<string, unknown> = {};
		const source = Array.from({ length: 400 }, () => 'word').join(' ');
		await markdownToHtml(source, { data, mdastPlugins: [readingTime()] });
		expect(data.minutesRead).toBe(2);
	});

	describe('MDX', () => {
		test('counts prose inside a custom component', async () => {
			const child = Array.from({ length: 400 }, () => 'word').join(' ');
			const source = `<Callout>\n${child}\n</Callout>`;
			expect(await readMinutesMdx(source)).toBe(2);
		});

		test('ignores imports, expressions, and component attributes', async () => {
			const source = [
				"import Callout from './Callout.astro';",
				'',
				'The value is {frontmatter.title} here.',
				'',
				'<Callout data-note="attribute text that should not count">child prose</Callout>',
			].join('\n');
			// Only the handful of prose words count => under a minute => ceil to 1
			expect(await readMinutesMdx(source)).toBe(1);
		});
	});
});
