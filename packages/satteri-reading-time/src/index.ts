import type { Data, MdastPluginDefinition } from 'satteri';

import { countWordsBreakdown } from '@xsynaptic/word-count';
import { z } from 'zod';

const optionsSchema = z.object({
	countCodeBlocks: z.boolean().default(false),
	frontmatterKey: z.string().default('minutesRead'),
	latinWpm: z.number().positive().default(200),
	scriptCharPerMinute: z.number().positive().default(300),
});

type ReadingTimeOptions = z.input<typeof optionsSchema>;

export function readingTime(
	options?: null | Readonly<ReadingTimeOptions>,
): () => MdastPluginDefinition {
	const settings = optionsSchema.parse(options ?? {});

	// Factory form: Sätteri calls it once per document so codeWords resets per file
	return () => {
		let codeWords = 0;

		const definition: MdastPluginDefinition = {
			after(root, ctx) {
				const text = ctx.textContent(root, { includeHtml: false, includeImageAlt: false });
				const { scriptChars, words } = countWordsBreakdown(text);

				if (words === 0 && scriptChars === 0 && codeWords === 0) return;

				const minutes = Math.ceil(
					(words + codeWords) / settings.latinWpm + scriptChars / settings.scriptCharPerMinute,
				);

				resolveTarget(ctx.data)[settings.frontmatterKey] = minutes;
			},
			name: 'reading-time',
		};

		// textContent omits fenced code, so count it here when enabled
		if (settings.countCodeBlocks) {
			definition.code = (node) => {
				codeWords += countWordsBreakdown(node.value).total;
			};
		}

		return definition;
	};
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
