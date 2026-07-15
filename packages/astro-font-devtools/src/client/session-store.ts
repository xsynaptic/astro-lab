const storageKey = 'astro-font-devtools:state';

export interface Selection {
	family: string;
	italic?: boolean;
	weight?: number;
}

interface State {
	added: Array<string>;
	selections: Record<string, Selection>;
}

export function addedTargets(): Array<string> {
	return loadState().added;
}

export function getSelection(target: string): Selection | undefined {
	return loadState().selections[target];
}

export function removeSelection(target: string): void {
	const state = loadState();
	if (!Object.hasOwn(state.selections, target)) return;
	state.selections = Object.fromEntries(
		Object.entries(state.selections).filter(([key]) => key !== target),
	);
	saveState(state);
}

export function setSelection(target: string, selection: Selection): void {
	const state = loadState();
	state.selections[target] = selection;
	saveState(state);
}

// Track user-added targets so picks/adds survive reload; re-keys on edit, drops on delete
export function syncAdded(oldTarget: string, newTarget: string): void {
	const state = loadState();
	state.added = state.added.filter((entry) => entry !== oldTarget);
	if (newTarget && !state.added.includes(newTarget)) state.added.push(newTarget);
	saveState(state);
}

function isSelection(value: unknown): value is Selection {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.family !== 'string') return false;
	if (candidate.italic !== undefined && typeof candidate.italic !== 'boolean') return false;
	return candidate.weight === undefined || typeof candidate.weight === 'number';
}

function isState(value: unknown): value is State {
	if (typeof value !== 'object' || value === null) return false;
	const { added, selections } = value as Record<string, unknown>;
	if (
		!Array.isArray(added) ||
		(added as Array<unknown>).some((entry) => typeof entry !== 'string')
	) {
		return false;
	}
	if (typeof selections !== 'object' || selections === null) return false;
	return Object.values(selections as Record<string, unknown>).every(isSelection);
}

function loadState(): State {
	const fallback: State = { added: [], selections: {} };
	const raw = sessionStorage.getItem(storageKey);
	if (!raw) return fallback;
	try {
		const parsed: unknown = JSON.parse(raw);

		return isState(parsed) ? parsed : fallback;
	} catch {
		return fallback;
	}
}

function saveState(state: State): void {
	try {
		sessionStorage.setItem(storageKey, JSON.stringify(state));
	} catch {
		/* sessionStorage may be unavailable in some contexts */
	}
}
