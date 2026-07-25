import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { defineCollection, z } from 'astro:content';
import { pageSiteGraphSchema } from 'starlight-site-graph/schema';

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({
			extend: pageSiteGraphSchema.and(
				z.object({
					category: z.string().optional(),
					date: z.string().or(z.coerce.string()).optional(),
					tags: z.array(z.string()).optional(),
				})
			),
		}),
	}),
};
// reload-stamp: 1784986293789
