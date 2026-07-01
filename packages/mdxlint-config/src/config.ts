import type { PluggableList } from 'unified';

import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkLintListItemIndent from 'remark-lint-list-item-indent';
import remarkPresetLintConsistent from 'remark-preset-lint-consistent';
import remarkPresetLintRecommended from 'remark-preset-lint-recommended';

interface MdxlintConfig {
	plugins: PluggableList;
	settings: Record<string, unknown>;
}

// Healthy defaults shared across projects; a project's own .mdxlintrc.mjs can spread and override
const mdxlintConfig: MdxlintConfig = {
	plugins: [
		remarkGfm,
		[remarkFrontmatter, 'yaml'],
		remarkPresetLintConsistent,
		remarkPresetLintRecommended,
		[remarkLintListItemIndent, 'mixed'],
	],
	settings: {
		bullet: '-',
		emphasis: '*',
		listItemIndent: 'one',
		resourceLink: true,
	},
};

export default mdxlintConfig;
