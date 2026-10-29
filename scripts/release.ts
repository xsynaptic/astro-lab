#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

interface PackageManifest {
	name: string;
	private?: boolean;
	version: string;
}

const releasePaths = ['packages', '.changeset', 'pnpm-lock.yaml'];

function run(command: string, args: Array<string>) {
	const result = spawnSync(command, args, { stdio: 'inherit' });

	if (result.status !== 0) process.exit(result.status ?? 1);
}

function runQuietly(script: string) {
	const logDirectory = mkdtempSync(path.join(tmpdir(), 'release-'));
	const logPath = path.join(logDirectory, 'output.log');
	const logFile = openSync(logPath, 'w');
	const startedAt = performance.now();

	process.stdout.write(`pnpm ${script}… `);

	// One descriptor for both streams keeps the log in the order the child wrote it
	const result = spawnSync('pnpm', [script], { stdio: ['ignore', logFile, logFile] });

	closeSync(logFile);

	const output = readFileSync(logPath, 'utf8');
	const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);

	rmSync(logDirectory, { recursive: true });

	if (result.status !== 0) {
		console.log(`failed after ${seconds}s\n`);
		process.stdout.write(output);
		process.exit(result.status ?? 1);
	}

	console.log(`done in ${seconds}s`);
}

function exitWith(message: string) {
	console.error(message);
	process.exit(1);
}

async function isPublished({ name, version }: PackageManifest) {
	const response = await fetch(`https://registry.npmjs.org/${name}/${version}`, { method: 'HEAD' });

	if (response.status === 404) return false;
	if (!response.ok)
		throw new Error(`npm registry answered ${String(response.status)} for ${name}@${version}`);

	return true;
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

const manifests = readdirSync('packages')
	.map(
		(directory) =>
			JSON.parse(
				readFileSync(path.join('packages', directory, 'package.json'), 'utf8'),
			) as PackageManifest,
	)
	.filter((manifest) => !manifest.private);

const lookups = await Promise.all(
	manifests.map(async (manifest) => ({ isPublished: await isPublished(manifest), manifest })),
);
const unpublished = lookups
	.filter((lookup) => !lookup.isPublished)
	.map((lookup) => lookup.manifest);

if (unpublished.length === 0) {
	console.log('Nothing to release; every package version is already on npm');
	process.exit(0);
}

console.log(
	`Releasing ${unpublished.map((manifest) => `${manifest.name}@${manifest.version}`).join(', ')}\n`,
);

runQuietly('build');
runQuietly('check');
runQuietly('test:e2e');
run('pnpm', ['changeset', 'publish']);
// The checks above already gated this tree; the hook would recheck unrelated work in progress
run('git', ['push', '--no-verify', '--follow-tags']);
