import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { ContentEntry } from '../src/astro.js';

import {
	checkComponentProps,
	checkComponentTargets,
	checkEntryIds,
	checkReferences,
	findComponentTags,
	getBodyLineOffset,
	getTagProp,
} from '../src/content-checks.js';

const body = 'Prose above.\n\n<Link>no id</Link>\n<Link id="gone" />\n<Img src="a.jpg" />\n';
const source = `---\ntitle: A post\n---\n\n${body}`;

let rootPath: string;

function makeEntry(overrides: Partial<ContentEntry> & Pick<ContentEntry, 'id'>): ContentEntry {
	return { collection: 'posts', data: {}, ...overrides };
}

beforeEach(async () => {
	rootPath = await fs.mkdtemp(path.join(tmpdir(), 'content-checks-'));
	await fs.writeFile(path.join(rootPath, 'a-post.mdx'), source);
});

afterEach(async () => {
	await fs.rm(rootPath, { force: true, recursive: true });
});

describe('findComponentTags and getTagProp', () => {
	test('match names exactly and read props across lines, not `data-` props', () => {
		const tags = findComponentTags(
			'<LinkList items="a" />\n<Img\n\tsrc="b.jpg"\n/>\n<Link data-id="c">x</Link>',
			['Img', 'Link'],
		);

		expect(tags.map((tag) => [tag.name, tag.lineNumber])).toEqual([
			['Img', 2],
			['Link', 5],
		]);
		expect(tags.map((tag) => getTagProp(tag, tag.name === 'Img' ? 'src' : 'id'))).toEqual([
			'b.jpg',
			undefined,
		]);
	});
});

describe('findComponentTags on MDX', () => {
	test('finds no tags in fenced code, inline code or comments', () => {
		const tags = findComponentTags(
			'```mdx\n<Img src="a.jpg" />\n```\n\nSee `<Img src="b.jpg" />`.\n\n{/* <Img src="c.jpg" /> */}\n',
			['Img'],
		);

		expect(tags).toEqual([]);
	});

	test('reads a prop after an attribute holding `>`', () => {
		const [tag] = findComponentTags('<Img alt="a > b" src="a.jpg" />', ['Img']);

		expect(tag && getTagProp(tag, 'src')).toBe('a.jpg');
	});

	test('reports a tag with children, a multi-line child and an inline tag on their own lines', () => {
		const tags = findComponentTags(
			'<ImgGroup>\n<Img\n\tsrc="a.jpg"\n/>\n</ImgGroup>\n\nSee <Link id="b">here</Link>.',
			['Img', 'ImgGroup', 'Link'],
		);

		expect(tags.map((tag) => [tag.name, tag.lineNumber])).toEqual([
			['ImgGroup', 1],
			['Img', 2],
			['Link', 7],
		]);
	});
});

describe('getBodyLineOffset', () => {
	test('measures the frontmatter a body was stripped of, and is zero without a file', () => {
		expect(getBodyLineOffset(makeEntry({ body, filePath: 'a-post.mdx', id: 'a' }), rootPath)).toBe(
			4,
		);
		expect(getBodyLineOffset(makeEntry({ body, filePath: 'gone.mdx', id: 'a' }), rootPath)).toBe(0);
	});
});

describe('checkComponentProps', () => {
	test('locates each component missing a required prop by file and line', () => {
		const result = checkComponentProps([makeEntry({ body, filePath: 'a-post.mdx', id: 'a' })], {
			required: { Img: 'src', Link: 'id' },
			rootPath,
		});

		expect(result).toMatchObject({
			issues: [
				{
					details: ['<Link>no id</Link>'],
					location: 'a-post.mdx:7',
					message: 'Link component missing id prop',
				},
			],
			status: 'fail',
		});
	});
	test('counts an expression value as present', () => {
		const result = checkComponentProps(
			[makeEntry({ body: '<Img src={"a.jpg"} />\n<Img src />', filePath: 'a-post.mdx', id: 'a' })],
			{ required: { Img: 'src' }, rootPath },
		);

		expect(result.issues).toEqual([
			{
				details: ['<Img src />'],
				location: 'a-post.mdx:2',
				message: 'Img component missing src prop',
			},
		]);
	});

	test('reports a body that fails to parse at its entry instead of throwing', () => {
		const result = checkComponentProps(
			[makeEntry({ body: 'An <Img src="a.jpg" < tag', filePath: 'a-post.mdx', id: 'a' })],
			{ required: { Img: 'src' }, rootPath },
		);

		expect(result).toMatchObject({
			issues: [
				{
					location: 'a-post.mdx',
					message: expect.stringMatching(/^MDX failed to parse: .*mdx-jsx:unexpected-character/),
				},
			],
			status: 'fail',
		});
	});
});

describe('checkComponentTargets', () => {
	test('reports a target that resolves nowhere, leaving a missing prop to the props check', () => {
		const result = checkComponentTargets([makeEntry({ body, filePath: 'a-post.mdx', id: 'a' })], {
			component: 'Link',
			prop: 'id',
			rootPath,
			targets: ['a'],
		});

		expect(result.issues).toEqual([{ location: 'a-post.mdx:8', message: 'broken Link id "gone"' }]);
	});

	test('skips an expression value, which it cannot resolve', () => {
		const result = checkComponentTargets(
			[makeEntry({ body: '<Link id={"gone"} />', filePath: 'a-post.mdx', id: 'a' })],
			{ component: 'Link', prop: 'id', rootPath, targets: ['a'] },
		);

		expect(result.issues).toEqual([]);
	});

	test('words its summary and issues from the label', () => {
		const entries = [makeEntry({ body, filePath: 'a-post.mdx', id: 'a' })];
		const options = { component: 'Link', label: 'Link ID', prop: 'id', rootPath };

		expect(checkComponentTargets(entries, { ...options, targets: ['a'] })).toMatchObject({
			issues: [{ message: 'broken Link ID "gone"' }],
			summary: 'Found 1 broken Link ID(s)',
		});
		expect(checkComponentTargets(entries, { ...options, targets: ['a', 'gone'] })).toMatchObject({
			summary: 'Link IDs valid',
		});
	});
});

describe('checkReferences', () => {
	test('checks each reference against the collection it names, unless that collection is skipped', () => {
		const entries = [
			makeEntry({ collection: 'regions', id: 'taiwan' }),
			makeEntry({ collection: 'themes', id: 'temples' }),
			makeEntry({
				data: {
					images: [{ collection: 'images', id: 'a.jpg' }],
					regions: [
						{ collection: 'regions', id: 'taiwan' },
						{ collection: 'regions', id: 'temples' },
					],
				},
				filePath: 'a-post.mdx',
				id: 'a',
			}),
		];

		expect(checkReferences(entries, { skipCollections: ['images'] }).issues).toEqual([
			{
				location: 'a-post.mdx',
				message: 'regions[1] references "temples", missing from "regions"',
			},
		]);
	});
});

describe('checkEntryIds', () => {
	test('reports every location of an id claimed twice, including ids an entry publishes', () => {
		const entries = [
			makeEntry({ filePath: 'posts/a.mdx', id: 'a' }),
			makeEntry({ data: { publicId: 'a' }, filePath: 'locations/b.mdx', id: 'b' }),
		];
		const result = checkEntryIds(entries, {
			getIds: (entry) => [
				entry.id,
				...(typeof entry.data.publicId === 'string' ? [entry.data.publicId] : []),
			],
		});

		expect(result.issues).toEqual([
			{ location: 'posts/a.mdx', message: 'duplicate entry ID "a"' },
			{ location: 'locations/b.mdx', message: 'duplicate entry ID "a"' },
		]);
		expect(checkEntryIds(entries).status).toBe('pass');
	});
});
