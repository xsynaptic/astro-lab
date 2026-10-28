import chalk from 'chalk';

import { formatMessage } from './output/human-format.js';
import { log } from './output/output.js';
import { UserError } from './user-error.js';

export interface EntryReference {
	collection: string;
	field: string;
	id: string;
}

export interface ReferenceIssue extends EntryReference {
	location: string;
}

export interface ValidationIssue {
	details?: Array<string>;
	location?: string;
	message: string;
}

export interface ValidationResult {
	issues: Array<ValidationIssue>;
	notes?: Array<string>;
	status: 'fail' | 'pass' | 'warn';
	summary: string;
}

export interface Validation {
	name: string;
	run: () => Promise<ValidationResult> | ValidationResult;
}

interface ValidationSummaries {
	fail: string;
	pass: string;
}

interface RunValidationsOptions {
	only?: string | undefined;
	signal?: AbortSignal;
}

function formatIssue(
	{ details = [], location, message }: ValidationIssue,
	level: 'error' | 'warn',
) {
	const text = location === undefined ? message : `${location}: ${message}`;

	return [
		formatMessage(level, text, chalk),
		...details.map((detail) => formatMessage('detail', detail, chalk)),
	];
}

function formatValidationResult({ issues, notes = [], status, summary }: ValidationResult) {
	const issueLevel = status === 'fail' ? 'error' : 'warn';
	const summaryLevel = status === 'pass' ? 'success' : issueLevel;

	return [
		...issues.flatMap((issue) => formatIssue(issue, issueLevel)),
		formatMessage(summaryLevel, summary, chalk),
		...notes.map((note) => formatMessage('detail', note, chalk)),
	].join('\n');
}

export function toValidationResult(
	issues: Array<ValidationIssue>,
	summaries: ValidationSummaries,
): ValidationResult {
	if (issues.length === 0) return { issues: [], status: 'pass', summary: summaries.pass };

	return { issues, status: 'fail', summary: summaries.fail };
}

export function toReferenceValidationResult(
	issues: Array<ReferenceIssue>,
	summaries: ValidationSummaries,
): ValidationResult {
	return toValidationResult(
		issues.map(({ collection, field, id, location }) => ({
			location,
			message: `${field} references "${id}", missing from "${collection}"`,
		})),
		summaries,
	);
}

export function reportValidationResult(result: ValidationResult): void {
	log.data(result, formatValidationResult);
}

export async function runValidations(
	validations: Array<Validation>,
	{ only, signal }: RunValidationsOptions = {},
): Promise<void> {
	const selected =
		only === undefined ? validations : validations.filter((validation) => validation.name === only);

	if (only !== undefined && selected.length === 0) {
		const names = validations.map((validation) => validation.name).join(', ');

		throw new UserError(`Unknown check "${only}"; choose from ${names}`);
	}

	let failureCount = 0;

	for (const { name, run } of selected) {
		signal?.throwIfAborted();

		const result = await run();

		log.data({ name, ...result }, formatValidationResult);

		if (result.status === 'fail') failureCount += 1;
	}

	if (only !== undefined || failureCount === 0) return;

	throw new UserError(`${String(failureCount)} of ${String(selected.length)} checks failed`);
}
