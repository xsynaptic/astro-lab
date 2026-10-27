// Matched by `name`, so a library's own `UserError` class reports the same way
export class UserError extends Error {
	detail?: string;
	override name = 'UserError';

	constructor(message: string, options?: ErrorOptions & { detail?: string }) {
		super(message, options);

		if (options?.detail !== undefined) this.detail = options.detail;
	}
}

export function isUserError(error: unknown): error is Error & { detail?: unknown } {
	return error instanceof Error && error.name === 'UserError';
}
