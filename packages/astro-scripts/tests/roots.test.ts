import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { findAstroRoot } from '../src/astro.js';
import { findWorkspaceRoot } from '../src/workspace.js';

let tempDir: string;

beforeEach(() => {
	tempDir = mkdtempSync(path.join(os.tmpdir(), 'astro-scripts-root-test-'));
});

afterEach(() => {
	rmSync(tempDir, { force: true, recursive: true });
});

function makeTree(markerFilename: string | undefined, nested: string) {
	const nestedDir = path.join(tempDir, nested);

	mkdirSync(nestedDir, { recursive: true });

	if (markerFilename) writeFileSync(path.join(tempDir, markerFilename), '');

	return nestedDir;
}

// `withAstroContent` has no direct test; vitest runs from a root of its own, which masks the unrooted-config failure
describe('findAstroRoot', () => {
	test('walks up from a nested package to the directory holding the config', () => {
		const nestedDir = makeTree('astro.config.ts', 'packages/scripts');

		expect(findAstroRoot(nestedDir)).toBe(tempDir);
	});

	test.each(['astro.config.mjs', 'astro.config.js', 'astro.config.mts'])(
		'accepts %s, as Astro does',
		(configFilename) => {
			const nestedDir = makeTree(configFilename, 'packages/scripts');

			expect(findAstroRoot(nestedDir)).toBe(tempDir);
		},
	);

	// Astro refuses the CommonJS variants, so treating one as a root would read every collection back empty
	test('ignores astro.config.cjs', () => {
		const nestedDir = makeTree('astro.config.cjs', 'packages/scripts');

		expect(() => findAstroRoot(nestedDir)).toThrow('Could not locate an Astro config');
	});

	test('throws rather than returning a root with no config', () => {
		const nestedDir = makeTree(undefined, 'packages/scripts');

		expect(() => findAstroRoot(nestedDir)).toThrow('Could not locate an Astro config');
	});
});

describe('findWorkspaceRoot', () => {
	test('walks up from a nested package to the directory holding pnpm-workspace.yaml', () => {
		const nestedDir = makeTree('pnpm-workspace.yaml', 'web/scripts');

		expect(findWorkspaceRoot(nestedDir)).toBe(tempDir);
	});

	test('throws rather than returning a root with no workspace file', () => {
		const nestedDir = makeTree(undefined, 'web/scripts');

		expect(() => findWorkspaceRoot(nestedDir)).toThrow('Could not locate pnpm-workspace.yaml');
	});
});
