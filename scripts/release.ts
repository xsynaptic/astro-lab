#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const releasePaths = ['packages', '.changeset', 'pnpm-lock.yaml'];

function run(command: string, args: Array<string>) {
	const result = spawnSync(command, args, { stdio: 'inherit' });

	if (result.status !== 0) process.exit(result.status ?? 1);
}

function exitWith(message: string) {
	console.error(message);
	process.exit(1);
}

const uncommitted = spawnSync('git', ['status', '--porcelain', '--', ...releasePaths], {
	encoding: 'utf8',
}).stdout.trimEnd();

// `changeset publish` packs from the working tree, so it must match what is committed
if (uncommitted) exitWith(`Commit or stash these before releasing:\n${uncommitted}`);

const hasChangesets = readdirSync('.changeset').some(
	(fileName) => fileName.endsWith('.md') && fileName !== 'README.md',
);

if (hasChangesets) exitWith('Pending changesets; run `pnpm version-packages` and commit first');

run('pnpm', ['build']);
run('pnpm', ['check']);
run('pnpm', ['test:e2e']);
run('pnpm', ['check:pkg']);
run('pnpm', ['changeset', 'publish']);
// The checks above already gated this tree; the hook would recheck unrelated work in progress
run('git', ['push', '--no-verify', '--follow-tags']);
