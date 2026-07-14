import type { LoaderContext } from 'astro/loaders';

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import type { ImageLoaderDataHandler } from '../src/types.js';

import { composePlugins } from '../src/compose-plugins.js';
import { imageLoader } from '../src/index.js';
import { createMockLoaderContext } from './mock-loader-context.js';

const handlerArgs: Parameters<ImageLoaderDataHandler>[0] = {
	filePath: 'a.jpg',
	filePathRelative: 'a.jpg',
	fileUrl: new URL('file:///a.jpg'),
	id: 'a.jpg',
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as LoaderContext['logger'],
	modifiedTime: new Date(0),
};

async function createFixtureDir(files: Array<string>) {
	const dir = await mkdtemp(path.join(tmpdir(), 'compose-plugins-'));

	for (const file of files) {
		const filePath = path.join(dir, file);

		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, `fixture:${file}`);
	}

	return { dir, root: new URL(`${pathToFileURL(dir).href}/`) };
}

describe('composePlugins', () => {
	test('merges plugin schema fragments onto the base schema, last wins on collision', () => {
		const { schema } = composePlugins({
			plugins: [
				{ schema: z.object({ width: z.number() }) },
				{ schema: z.object({ height: z.number(), width: z.string() }) },
			],
		});

		expect(Object.keys(schema.shape).sort((a, b) => a.localeCompare(b))).toEqual([
			'height',
			'modifiedTime',
			'src',
			'width',
		]);

		// The later fragment typed width as string; a numeric width should now fail
		const valid = { height: 2, modifiedTime: new Date(), src: 'x', width: 'w' };

		expect(schema.safeParse(valid).success).toBe(true);
		expect(schema.safeParse({ ...valid, width: 5 }).success).toBe(false);
	});

	test('runs plugin dataHandlers in array order with the inline handler last', async () => {
		const calls: Array<string> = [];

		const composed = composePlugins({
			dataHandler: () => {
				calls.push('inline');
				return { shared: 'inline' };
			},
			plugins: [
				{
					dataHandler: () => {
						calls.push('p1');
						return { a: 1, shared: 'p1' };
					},
				},
				{
					dataHandler: () => {
						calls.push('p2');
						return { b: 2, shared: 'p2' };
					},
				},
			],
		});

		const output = await composed.dataHandler?.(handlerArgs);

		expect(calls).toEqual(['p1', 'p2', 'inline']);
		expect(output).toEqual({ a: 1, b: 2, shared: 'inline' });
	});

	test('combines invalidation keys; a single key passes through unchanged', () => {
		expect(composePlugins({}).invalidationKey).toBeUndefined();
		expect(composePlugins({ invalidationKey: 'v1' }).invalidationKey).toBe('v1');
		expect(composePlugins({ plugins: [{ invalidationKey: 'p1' }] }).invalidationKey).toBe('p1');
		expect(
			composePlugins({ invalidationKey: 'v1', plugins: [{ invalidationKey: 'p1' }] })
				.invalidationKey,
		).toBe(JSON.stringify(['p1', 'v1']));
	});

	test('composes lifecycle hooks, plugins before the inline hook', async () => {
		const order: Array<string> = [];

		const composed = composePlugins({
			afterLoad: () => {
				order.push('inline.after');
			},
			beforeLoad: () => {
				order.push('inline.before');
			},
			plugins: [
				{
					afterLoad: () => {
						order.push('p1.after');
					},
					beforeLoad: () => {
						order.push('p1.before');
					},
				},
			],
		});

		await composed.beforeLoad?.();
		await composed.afterLoad?.();

		expect(order).toEqual(['p1.before', 'inline.before', 'p1.after', 'inline.after']);
	});

	test('omits composed handlers and hooks when nothing supplies them', () => {
		const composed = composePlugins({});

		expect(composed.dataHandler).toBeUndefined();
		expect(composed.beforeLoad).toBeUndefined();
		expect(composed.afterLoad).toBeUndefined();
	});

	test('the loader applies a plugin end to end: output stored, hooks fired, schema exposed', async () => {
		const { root } = await createFixtureDir(['a.jpg']);
		const { context, entries } = createMockLoaderContext({ root });

		const beforeLoad = vi.fn();
		const afterLoad = vi.fn();

		const loader = imageLoader({
			plugins: [
				{
					afterLoad,
					beforeLoad,
					dataHandler: () => ({ title: 'from-plugin' }),
					invalidationKey: 'plugin:v1',
					schema: z.object({ title: z.string() }),
				},
			],
		});

		await loader.load(context);

		expect(entries.get('a.jpg')?.data.title).toBe('from-plugin');
		expect(beforeLoad).toHaveBeenCalledTimes(1);
		expect(afterLoad).toHaveBeenCalledTimes(1);
		expect(Object.keys(loader.schema.shape).sort((a, b) => a.localeCompare(b))).toEqual([
			'modifiedTime',
			'src',
			'title',
		]);
	});
});
