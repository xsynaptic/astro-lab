import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { findAstroRoot } from '../src/astro.js';
import { UserError } from '../src/user-error.js';
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

function writePackageJson(directory: string, packageJson: object = {}) {
	mkdirSync(directory, { recursive: true });
	writeFileSync(path.join(directory, 'package.json'), JSON.stringify(packageJson));
}

// vitest runs from a root of its own, which masks the unrooted-config failure
describe('findAstroRoot', () => {
	test('walks up from a nested package to the directory holding the config', () => {
		const nestedDir = makeTree('astro.config.ts', 'packages/scripts');

		expect(findAstroRoot(nestedDir)).toBe(tempDir);
	});

	// Astro refuses the CommonJS variants, so treating one as a root would read every collection back empty
	test('ignores astro.config.cjs', () => {
		const nestedDir = makeTree('astro.config.cjs', 'packages/scripts');

		expect(() => findAstroRoot(nestedDir)).toThrow('Could not locate an Astro config');
	});

	test('throws rather than returning a root with no config', () => {
		const nestedDir = makeTree(undefined, 'packages/scripts');

		expect(() => findAstroRoot(nestedDir)).toThrow('Could not locate an Astro config');
		expect(() => findAstroRoot(nestedDir)).toThrow(UserError);
	});
});

describe('findWorkspaceRoot', () => {
	test('walks up from a nested package to the directory holding pnpm-workspace.yaml', () => {
		const nestedDir = makeTree('pnpm-workspace.yaml', 'web/scripts');

		writePackageJson(path.join(tempDir, 'web'));

		expect(findWorkspaceRoot(nestedDir)).toBe(tempDir);
	});

	test('stops at a settings-only pnpm-workspace.yaml instead of climbing into an outer workspace', () => {
		const projectDir = path.join(tempDir, 'sites/blog');

		writePackageJson(tempDir, { workspaces: ['sites/*'] });
		writePackageJson(projectDir);
		writeFileSync(
			path.join(projectDir, 'pnpm-workspace.yaml'),
			'onlyBuiltDependencies:\n  - sharp\n',
		);
		mkdirSync(path.join(projectDir, 'scripts'));

		expect(findWorkspaceRoot(path.join(projectDir, 'scripts'))).toBe(projectDir);
	});

	test.each([
		['npm and Bun', ['packages/*']],
		['Yarn classic', { packages: ['packages/*'] }],
	])('finds a %s workspaces root', (_manager, workspaces) => {
		const packageDir = path.join(tempDir, 'packages/scripts');

		writePackageJson(tempDir, { workspaces });
		writePackageJson(packageDir);

		expect(findWorkspaceRoot(packageDir)).toBe(tempDir);
	});

	test('with no workspace above, returns the nearest package.json directory', () => {
		const nestedDir = makeTree(undefined, 'scripts/lib');

		writePackageJson(tempDir);

		expect(findWorkspaceRoot(nestedDir)).toBe(tempDir);
	});

	test('throws rather than returning a root with no package.json', () => {
		const nestedDir = makeTree(undefined, 'web/scripts');

		expect(() => findWorkspaceRoot(nestedDir)).toThrow('Could not locate a workspace root');
		expect(() => findWorkspaceRoot(nestedDir)).toThrow(UserError);
	});
});
