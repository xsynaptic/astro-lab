import chalk from 'chalk';

import { getCommandSignal } from './command.js';
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

export type ValidationCheck = () => Promise<ValidationResult> | ValidationResult;

interface ValidationSummaries {
	fail: string;
	pass: string;
}

interface ValidationResultOptions {
	severity?: 'fail' | 'warn';
}

interface RunValidationsOptions<Name extends string> {
	only?: Name | undefined;
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
	{ severity = 'fail' }: ValidationResultOptions = {},
): ValidationResult {
	if (issues.length === 0) return { issues: [], status: 'pass', summary: summaries.pass };

	return { issues, status: severity, summary: summaries.fail };
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

export async function runValidations<Name extends string>(
	names: ReadonlyArray<Name>,
	checks: Record<NoInfer<Name>, ValidationCheck>,
	{ only, signal = getCommandSignal() }: RunValidationsOptions<NoInfer<Name>> = {},
): Promise<void> {
	const selected = only === undefined ? names : [only];
	let failureCount = 0;

	for (const name of selected) {
		signal?.throwIfAborted();

		const result = await checks[name]();

		log.data({ name, ...result }, formatValidationResult);

		if (result.status === 'fail') failureCount += 1;
	}

	if (only !== undefined || failureCount === 0) return;

	throw new UserError(`${String(failureCount)} of ${String(selected.length)} checks failed`);
}
