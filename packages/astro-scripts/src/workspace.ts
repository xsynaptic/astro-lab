import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { UserError } from './user-error.js';

function readPackageJson(directory: string) {
	const filePath = path.join(directory, 'package.json');

	if (!existsSync(filePath)) return;

	return JSON.parse(readFileSync(filePath, 'utf8')) as { workspaces?: unknown };
}

function isWorkspaceRoot(directory: string, packageJson: undefined | { workspaces?: unknown }) {
	return (
		existsSync(path.join(directory, 'pnpm-workspace.yaml')) || packageJson?.workspaces !== undefined
	);
}

export function findWorkspaceRoot(startDir = process.cwd()) {
	let current = path.resolve(startDir);
	let nearestPackage: string | undefined;

	while (current !== path.dirname(current)) {
		const packageJson = readPackageJson(current);

		if (isWorkspaceRoot(current, packageJson)) return current;

		if (packageJson && nearestPackage === undefined) nearestPackage = current;

		current = path.dirname(current);
	}

	if (nearestPackage !== undefined) return nearestPackage;

	throw new UserError(`Could not locate a workspace root or a package.json above ${startDir}`);
}
