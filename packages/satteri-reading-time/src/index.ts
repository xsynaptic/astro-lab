import type {
	Data,
	MdastNode,
	MdastPluginDefinition,
	MdastPluginInput,
	MdastVisitorContext,
} from 'satteri';

import { countWordsBreakdown } from '@xsynaptic/word-count';
import { z } from 'zod';

const optionsSchema = z.object({
	countCodeBlocks: z.boolean().default(false),
	frontmatterKey: z.string().default('minutesRead'),
	latinWpm: z.number().positive().default(200),
	scriptCharPerMinute: z.number().positive().default(300),
});

type ReadingTimeOptions = z.input<typeof optionsSchema>;

export function readingTime(options?: null | Readonly<ReadingTimeOptions>): MdastPluginInput {
	const settings = optionsSchema.parse(options ?? {});

	// Factory form: Sätteri calls it once per document so accumulators reset per file
	return () => {
		let prose: undefined | { scriptChars: number; words: number };
		let codeWords = 0;

		// No finalize hook, so compute prose once and rewrite the value on every visit
		function write(node: Readonly<MdastNode>, ctx: MdastVisitorContext): void {
			if (prose === undefined) {
				const text = ctx.textContent(findRoot(node, ctx), {
					includeHtml: false,
					includeImageAlt: false,
				});
				const { scriptChars, words } = countWordsBreakdown(text);
				prose = { scriptChars, words };
			}

			const minutes = Math.ceil(
				(prose.words + codeWords) / settings.latinWpm +
					prose.scriptChars / settings.scriptCharPerMinute,
			);

			resolveTarget(ctx.data)[settings.frontmatterKey] = minutes;
		}

		// textContent omits fenced code, so count it here when enabled
		const visitCode = (node: Readonly<MdastNode>, ctx: MdastVisitorContext): void => {
			if (node.type === 'code') codeWords += countWordsBreakdown(node.value).total;
			write(node, ctx);
		};

		// A text node sits under every content block, so one text hook reaches the root
		const definition: MdastPluginDefinition = { name: 'reading-time', text: write };
		if (settings.countCodeBlocks) definition.code = visitCode;
		return definition;
	};
}

// Sätteri has no root hook; parent-before-child traversal means any visited node reaches root
function findRoot(node: Readonly<MdastNode>, ctx: MdastVisitorContext): Readonly<MdastNode> {
	let root = node;
	let parent = ctx.parent(root);
	while (parent) {
		root = parent;
		parent = ctx.parent(parent);
	}
	return root;
}

// Under Astro the target is data.astro.frontmatter; standalone, fall back to the data bag itself
function resolveTarget(data: Data): Record<string, unknown> {
	const astro = data.astro;
	if (astro !== null && typeof astro === 'object' && 'frontmatter' in astro) {
		const { frontmatter } = astro;
		if (frontmatter !== null && typeof frontmatter === 'object') {
			return frontmatter as Record<string, unknown>;
		}
	}
	return data;
}

export type { ReadingTimeOptions };
