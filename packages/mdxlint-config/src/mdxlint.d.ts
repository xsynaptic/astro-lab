// mdxlint doesn't expose types through its package exports, so declare the minimal surface we use
// Its processor is a unified Processor, so the config plugins are a PluggableList
declare module 'mdxlint' {
	import type { PluggableList } from 'unified';

	interface MdxlintMessage {
		message: string;
	}

	interface MdxlintProcessor {
		data(key: string, value: unknown): MdxlintProcessor;
		process(file: { path: string; value: string }): Promise<MdxlintResult>;
		use(plugins: PluggableList): MdxlintProcessor;
	}

	interface MdxlintResult {
		messages: ReadonlyArray<MdxlintMessage>;
		toString(): string;
	}

	export function defineConfig<T>(config: T): T;
	export function mdxlint(): MdxlintProcessor;
}
