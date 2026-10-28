import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';

interface TemplateVersionOptions {
	files: ReadonlyArray<URL>;
	from: string | URL;
	packages?: ReadonlyArray<string>;
	parts?: ReadonlyArray<number | string>;
}

function readPackageVersion(name: string, from: string | URL) {
	const packagePath = findPackageJSON(name, from);

	if (!packagePath) throw new Error(`Could not find the installed ${name} package`);

	const { version } = JSON.parse(readFileSync(packagePath, 'utf8')) as { version: string };

	return `${name}@${version}`;
}

export function hashTemplateVersion({
	files,
	from,
	packages = [],
	parts = [],
}: TemplateVersionOptions) {
	const hash = createHash('sha256');
	const labels = [...parts.map(String), ...packages.map((name) => readPackageVersion(name, from))];

	for (const label of labels) hash.update(`${label}\0`);

	for (const file of files) {
		hash.update(readFileSync(file));
		hash.update('\0');
	}

	return hash.digest('hex').slice(0, 16);
}
