import { runSubprocess } from '../../src/index.js';

await runSubprocess('Echoing', [
	process.execPath,
	'-e',
	'console.log("subprocess stdout"); console.error("subprocess stderr")',
]);
