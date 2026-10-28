import { createCommandRunner, log } from '../../src/index.js';

const { runCommand } = createCommandRunner();

await runCommand({
	name: 'lqip',
	run: () => {
		log.data({ generated: 2 });
	},
	summary: 'Generate placeholders',
	title: 'LQIP',
});
