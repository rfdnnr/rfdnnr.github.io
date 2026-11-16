import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const cases = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/cases' }),
  schema: z.object({
    order: z.number(),
    slug: z.string(),
    label: z.string(),
    stmt: z.string(),
    sub: z.string(),
  }),
});

export const collections = { cases };
