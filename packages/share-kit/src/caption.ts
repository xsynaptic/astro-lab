import type { ShareKitDestination } from './destinations.js';

import { getGraphemes } from './count.js';

type CaptionDestination = Pick<ShareKitDestination<string>, 'count' | 'limit' | 'shape'>;

export interface ShareCaptionFields {
	description?: string | undefined;
	title: string;
	url: string;
}

export interface ShareCaption {
	count: number;
	isTruncated: boolean;
	limit: number | undefined;
	text: string;
}

const separator = '\n\n';

const ellipsis = '…';

// The locale comes from the payload, and a malformed tag like `en_US` throws
function createSegmenter(locale: string, granularity: 'sentence' | 'word') {
	try {
		return new Intl.Segmenter(locale, { granularity });
	} catch {
		return new Intl.Segmenter(undefined, { granularity });
	}
}

function getSegmentEnds(text: string, granularity: 'sentence' | 'word', locale: string) {
	const segments = createSegmenter(locale, granularity).segment(text);

	return Array.from(segments, ({ index, segment }) => index + segment.length);
}

function getGraphemeEnds(text: string) {
	let end = 0;

	return getGraphemes(text).map((grapheme) => (end += grapheme.length));
}

function join(parts: Array<string | undefined>) {
	return parts.filter(Boolean).join(separator);
}

interface CutInput {
	canFit: (candidate: string) => boolean;
	ends: Array<number>;
	suffix: string;
	text: string;
}

// Counts grow with the cut, so the scan stops at the first miss
function findCut({ canFit, ends, suffix, text }: CutInput) {
	let fitted: string | undefined;

	for (const end of ends) {
		const cut = text.slice(0, end).trimEnd();

		if (cut.length === 0 || cut.length === text.length) continue;

		const candidate = `${cut}${suffix}`;

		if (!canFit(candidate)) break;

		fitted = candidate;
	}

	return fitted;
}

interface FitInput {
	body: string | undefined;
	canFit: (text: string) => boolean;
	link: string | undefined;
	locale: string;
	title: string;
}

function fitBody({ body, canFit, link, locale, title }: FitInput) {
	if (!body) return;

	const canFitBody = (candidate: string) => canFit(join([title, candidate, link]));

	return (
		findCut({
			canFit: canFitBody,
			ends: getSegmentEnds(body, 'sentence', locale),
			suffix: '',
			text: body,
		}) ??
		findCut({
			canFit: canFitBody,
			ends: getSegmentEnds(body, 'word', locale),
			suffix: ellipsis,
			text: body,
		})
	);
}

function fitTitle({ canFit, link, locale, title }: FitInput) {
	const canFitTitle = (candidate: string) => canFit(join([candidate, link]));

	return (
		findCut({
			canFit: canFitTitle,
			ends: getSegmentEnds(title, 'word', locale),
			suffix: ellipsis,
			text: title,
		}) ??
		findCut({ canFit: canFitTitle, ends: getGraphemeEnds(title), suffix: ellipsis, text: title }) ??
		title
	);
}

function fitParts(input: FitInput) {
	const { canFit, link, title } = input;
	const body = fitBody(input);

	if (body) return join([title, body, link]);

	const bare = join([title, link]);

	return canFit(bare) ? bare : join([fitTitle(input), link]);
}

// The link is kept whole, then the title; the description takes what is left, cut at a sentence end or failing that a word
// A link too long to leave room for one grapheme of title comes back over the limit; nothing sensible fits
export function fitCaption(
	{ description, title, url }: ShareCaptionFields,
	{ count, limit, shape }: CaptionDestination,
	locale = 'en',
): ShareCaption {
	const link = shape === 'full' ? url : undefined;
	const body = shape === 'title' ? undefined : description?.trim() || undefined;
	const whole = shape === 'url' ? url : join([title, body, link]);
	const canFit = (text: string) => limit === undefined || count(text) <= limit;
	const text = canFit(whole) ? whole : fitParts({ body, canFit, link, locale, title });

	return { count: count(text), isTruncated: text !== whole, limit, text };
}
