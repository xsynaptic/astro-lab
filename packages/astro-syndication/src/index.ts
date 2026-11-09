export interface SyndicationImage {
	alt: string;
	height: number;
	type: string;
	url: string;
	width: number;
}

export interface SyndicationItem {
	contentHtml?: string;
	dateCreated: Date;
	dateUpdated?: Date;
	description?: string;
	image?: SyndicationImage;
	tags: Array<string>;
	title: string;
	url: string;
}

// Format-neutral; each format route adds its own self URL
export interface SyndicationPublication {
	copyright?: string;
	description: string;
	language: string;
	// Takes `context.site` as is; writers throw when it is missing
	site: undefined | URL;
	title: string;
}

const millisecondsPerHour = 3_600_000;

// Date-only values parse to 00:00 UTC, which future-dates today's entries east of UTC
export function anchorDateOnly(date: Date, { utcOffsetHours }: { utcOffsetHours: number }) {
	return new Date(date.getTime() - utcOffsetHours * millisecondsPerHour);
}
