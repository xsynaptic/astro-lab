import { promises as fs } from 'node:fs';
import path from 'node:path';

function isMissing(error: unknown) {
	return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

export async function readFileIfExists(filePath: string) {
	try {
		return await fs.readFile(filePath);
	} catch (error) {
		if (isMissing(error)) return;

		throw error;
	}
}

export async function readDirectoryIfExists(directory: string) {
	try {
		return await fs.readdir(directory);
	} catch (error) {
		if (isMissing(error)) return [];

		throw error;
	}
}

export async function readDirectoryTreeIfExists(directory: string) {
	try {
		return await fs.readdir(directory, { recursive: true, withFileTypes: true });
	} catch (error) {
		if (isMissing(error)) return [];

		throw error;
	}
}

export async function statIfExists(filePath: string) {
	try {
		return await fs.stat(filePath);
	} catch (error) {
		if (isMissing(error)) return;

		throw error;
	}
}

export async function readJsonFile<Value>(filePath: string) {
	const data = await readFileIfExists(filePath);

	return data ? (JSON.parse(data.toString('utf8')) as Value) : undefined;
}

export async function writeFileAtomic(filePath: string, data: string | Uint8Array) {
	const temporary = `${filePath}.tmp`;

	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(temporary, data);
	await fs.rename(temporary, filePath);
}

export async function writeJsonFile(filePath: string, value: unknown) {
	await writeFileAtomic(filePath, `${JSON.stringify(value)}\n`);
}
