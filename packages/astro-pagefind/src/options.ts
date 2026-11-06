import type { PagefindServiceConfig } from 'pagefind';

import { z } from 'zod';

// The Pagefind release the shape mirrors; bump it with the shape
const indexConfigRelease = { major: 1, minor: 6 };

// Keyed on the installed types, so a devDependency bump that adds or retypes a key fails check-types
const indexConfigShape = {
	excludeSelectors: z.array(z.string()).exactOptional(),
	forceLanguage: z.string().exactOptional(),
	includeCharacters: z.string().exactOptional(),
	keepIndexUrl: z.boolean().exactOptional(),
	logfile: z.string().exactOptional(),
	maxFragments: z.int().min(0).exactOptional(),
	rootSelector: z.string().exactOptional(),
	verbose: z.boolean().exactOptional(),
	writePlayground: z.boolean().exactOptional(),
} satisfies { [Key in keyof PagefindServiceConfig]-?: z.ZodType<PagefindServiceConfig[Key]> };

const knownKeys = Object.keys(indexConfigShape);

// Typed from the site's installed Pagefind rather than the schema, which has to accept newer keys
export interface PagefindOptions {
	indexConfig?: PagefindServiceConfig;
}

const optionsSchema = z
	.strictObject({ indexConfig: z.looseObject(indexConfigShape).optional() })
	.prefault({});

function isNewerRelease(version: string) {
	const [major = 0, minor = 0] = version.split('.').map(Number);

	if (major !== indexConfigRelease.major) return major > indexConfigRelease.major;

	return minor > indexConfigRelease.minor;
}

// Pagefind maps a fixed list of keys and drops the rest, so an unknown key on a known release is a typo
export function parseOptions(options: unknown, getPagefindVersion: () => string) {
	const result = optionsSchema.safeParse(options);

	if (!result.success) {
		throw new Error(
			`[@xsynaptic/astro-pagefind] Invalid options\n${z.prettifyError(result.error)}`,
		);
	}

	const { indexConfig } = result.data;
	const unknownKeys = Object.keys(indexConfig ?? {}).filter((key) => !knownKeys.includes(key));

	if (unknownKeys.length === 0) return { indexConfig, unknownKeys };

	const pagefindVersion = getPagefindVersion();

	if (isNewerRelease(pagefindVersion)) return { indexConfig, unknownKeys };

	throw new Error(
		`[@xsynaptic/astro-pagefind] Pagefind ${pagefindVersion} ignores indexConfig keys it doesn't know: ${unknownKeys.join(', ')}. It reads ${knownKeys.join(', ')}`,
	);
}

export function formatUnknownKeysWarning(unknownKeys: Array<string>, pagefindVersion: string) {
	return `indexConfig keys ${unknownKeys.join(', ')} are new since Pagefind ${String(indexConfigRelease.major)}.${String(indexConfigRelease.minor)}, so they go to Pagefind ${pagefindVersion} unchecked`;
}
