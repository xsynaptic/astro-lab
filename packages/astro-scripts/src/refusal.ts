// Matched by `name`, so a library's own `Refusal` class reports the same way
export class Refusal extends Error {
	override name = 'Refusal';
}

export function isRefusal(error: unknown): error is Error {
	return error instanceof Error && error.name === 'Refusal';
}
