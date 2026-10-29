import type { Input, Options } from 'ky';

import ky from 'ky';

import { getCommandSignal } from './command.js';

function getSignal(signal: Options['signal']) {
	const commandSignal = getCommandSignal();

	if (!signal) return commandSignal;

	if (!commandSignal) return signal;

	return AbortSignal.any([commandSignal, signal]);
}

export function fetchUrl(input: Input, options: Options = {}) {
	return ky(input, { ...options, signal: getSignal(options.signal) });
}
