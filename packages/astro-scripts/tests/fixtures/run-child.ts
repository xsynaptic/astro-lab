import { runChild } from '../../src/index.js';

await runChild('Echoing', [
	process.execPath,
	'-e',
	'console.log("child stdout"); console.error("child stderr")',
]);
