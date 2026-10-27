// Matched by `name`, so a library's own `UserError` class reports the same way
export class UserError extends Error {
	override name = 'UserError';
}

export function isUserError(error: unknown): error is Error {
	return error instanceof Error && error.name === 'UserError';
}
