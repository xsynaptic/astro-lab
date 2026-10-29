import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ResolvedImageEncoding } from './image-encoding.js';
import type { ImageSourceResolver } from './image-sources.js';

import { parseRenditionName } from './image-name.js';
import { readSourceSize, renderImage } from './image-render.js';
import { isWithinSource } from './image-sizes.js';

interface DevImageOptions {
	builtPath: string | undefined;
	devPath: string;
	encoding: ResolvedImageEncoding;
	limitInputPixels: number;
	mediaPath: string;
	render?: typeof renderImage;
	sources: ImageSourceResolver;
}

async function getModifiedTime(filePath: string) {
	try {
		const stats = await fs.stat(filePath);

		return stats.mtimeMs;
	} catch {
		return;
	}
}

function isWithinDirectory(directory: string, filePath: string) {
	const relativePath = path.relative(directory, filePath);

	return (
		relativePath !== '' &&
		relativePath.split(path.sep)[0] !== '..' &&
		!path.isAbsolute(relativePath)
	);
}

async function isNewerThanSource(target: string, sourceFilePath: string) {
	const [sourceTime, targetTime] = await Promise.all([
		getModifiedTime(sourceFilePath),
		getModifiedTime(target),
	]);

	return sourceTime !== undefined && targetTime !== undefined && targetTime >= sourceTime;
}

async function writeImage(target: string, data: Uint8Array) {
	const temporary = `${target}.${randomUUID()}.tmp`;

	await fs.mkdir(path.dirname(target), { recursive: true });
	await fs.writeFile(temporary, data);
	await fs.rename(temporary, target);
}

export function createDevImageResolver({
	builtPath,
	devPath,
	encoding,
	limitInputPixels,
	mediaPath,
	render = renderImage,
	sources,
}: DevImageOptions) {
	const inFlight = new Map<string, Promise<string | undefined>>();

	async function resolveImage(name: string) {
		const parsed = parseRenditionName(name);

		if (!parsed) return;

		const sourcePath = await sources.resolve(parsed.stem);

		if (sourcePath === undefined) return;

		const sourceFilePath = path.resolve(mediaPath, sourcePath);

		if (!isWithinDirectory(mediaPath, sourceFilePath)) return;

		if (builtPath) {
			const built = path.join(builtPath, name);

			if (await isNewerThanSource(built, sourceFilePath)) return built;
		}

		const target = path.join(devPath, name);

		if (await isNewerThanSource(target, sourceFilePath)) return target;

		if (!isWithinSource(parsed, await readSourceSize(sourceFilePath))) return;

		const { data } = await render(sourceFilePath, {
			encoding,
			format: parsed.format,
			height: parsed.height,
			limitInputPixels,
			width: parsed.width,
		});

		await writeImage(target, data);

		return target;
	}

	async function resolveOnce(name: string) {
		try {
			return await resolveImage(name);
		} finally {
			inFlight.delete(name);
		}
	}

	return function getDevImage(name: string) {
		const pending = inFlight.get(name);

		if (pending) return pending;

		const request = resolveOnce(name);

		inFlight.set(name, request);

		return request;
	};
}
