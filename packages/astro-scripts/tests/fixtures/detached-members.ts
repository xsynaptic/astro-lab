import type { Progress, Status } from '../../src/index.js';

import { log } from '../../src/index.js';

export function reportIssue(isFailure: boolean, text: string) {
	const report = isFailure ? log.error : log.warn;

	report(text);
}

export function finishStatus(status: Status, isFailure: boolean) {
	const finish = isFailure ? status.fail : status.succeed;

	finish();
}

export function finishProgress(progress: Progress, isFailure: boolean) {
	const finish = isFailure ? progress.fail : progress.succeed;

	finish();
}
