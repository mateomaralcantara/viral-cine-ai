import { z } from 'zod';
import { EntityIdSchema } from './common';
import { SequenceSchema } from './sequence';

export const ActSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  order: z.number().int().min(1).max(5),
  title: z.string().trim().min(1).max(240),
  dramaticObjective: z.string().max(12000).default(''),
  sequences: z.array(SequenceSchema).max(100).default([])
});

export type Act = z.infer<typeof ActSchema>;
