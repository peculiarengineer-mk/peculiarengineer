import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			tags: z.array(z.string()).optional(),
		}),
});

const experiments = defineCollection({
	// Load Markdown files in the `src/content/experiments/` directory.
	loader: glob({ base: './src/content/experiments', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Link out to the project's source.
			repo: z.string().url(),
			// Optional slug of a related blog post (links to /blog/<slug>/).
			blogSlug: z.string().optional(),
			pubDate: z.coerce.date(),
			tags: z.array(z.string()).optional(),
			heroImage: z.optional(image()),
		}),
});

export const collections = { blog, experiments };
