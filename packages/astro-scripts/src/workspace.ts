import { existsSync } from 'node:fs';
import path from 'node:path';

export function findWorkspaceRoot(startDir = process.cwd()) {
	let current = path.resolve(startDir);

	while (current !== path.dirname(current)) {
		if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;

		current = path.dirname(current);
	}

	throw new Error(`Could not locate pnpm-workspace.yaml above ${startDir}`);
}
