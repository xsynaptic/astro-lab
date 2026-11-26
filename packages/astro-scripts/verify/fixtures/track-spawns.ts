import type * as ChildProcessModule from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

export function trackSpawns(module: typeof ChildProcessModule, spawned: Set<ChildProcess>) {
	return {
		...module,
		spawn: new Proxy(module.spawn, {
			apply(target, thisArgument, argumentList) {
				const child = Reflect.apply(target, thisArgument, argumentList) as ChildProcess;

				spawned.add(child);

				return child;
			},
		}),
	};
}

export function killSpawned(spawned: Set<ChildProcess>) {
	for (const child of spawned) child.kill('SIGKILL');

	spawned.clear();
}
