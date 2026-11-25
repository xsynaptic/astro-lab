import type * as NodeFs from 'node:fs';

import type { Card } from './card-name.js';

export const imageRecordsVariable = 'XSYNAPTIC_IMAGE_RECORDS';

interface ImageRecorder {
	descriptor: number;
	directory: string;
	fs: typeof NodeFs;
	lines: Set<string>;
}

let recorder: ImageRecorder | undefined;

// node:fs is looked up lazily so the names entry still loads where it doesn't exist
function openRecorder(directory: string): ImageRecorder {
	const fs = process.getBuiltinModule('node:fs');
	const { threadId } = process.getBuiltinModule('node:worker_threads');
	const descriptor = fs.openSync(
		`${directory}/${String(process.pid)}-${String(threadId)}.ndjson`,
		'a',
	);

	return { descriptor, directory, fs, lines: new Set() };
}

function writeRecord(record: object) {
	if (typeof process === 'undefined') return;

	const directory = process.env[imageRecordsVariable];

	if (!directory) return;

	if (recorder?.directory !== directory) {
		if (recorder) recorder.fs.closeSync(recorder.descriptor);

		recorder = openRecorder(directory);
	}

	const line = JSON.stringify(record);

	if (recorder.lines.has(line)) return;

	recorder.lines.add(line);
	recorder.fs.writeSync(recorder.descriptor, `${line}\n`);
}

export function recordRendition(name: string, sourcePath: string) {
	writeRecord({ kind: 'rendition', name, sourcePath });
}

export function recordPlaceholder() {
	writeRecord({ kind: 'placeholder' });
}

// Page code and the integration load separate module instances in one realm, so dev cards hang off `globalThis`
const devCardsKey = Symbol.for('@xsynaptic/astro-image-pipeline/dev-cards');

function getDevCards(): Map<string, Card> | undefined {
	const cards: unknown = Reflect.get(globalThis, devCardsKey);

	if (cards instanceof Map) return cards;

	return undefined;
}

export function openDevCards() {
	const existing = getDevCards();

	if (existing) return existing;

	const cards = new Map<string, Card>();

	Reflect.set(globalThis, devCardsKey, cards);

	return cards;
}

export function recordCard(name: string, card: Card) {
	getDevCards()?.set(name, card);
	writeRecord({ card, kind: 'card', name });
}
