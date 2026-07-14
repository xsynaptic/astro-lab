import { z } from 'zod';

// Fields the loader itself supplies; a dataHandler's output needs a custom schema
export const ImageLoaderBaseSchema = z.object({
	modifiedTime: z.date(),
	src: z.string(),
});
