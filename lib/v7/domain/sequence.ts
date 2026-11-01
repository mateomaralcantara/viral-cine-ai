import { z } from 'zod';
import { EntityIdSchema } from './common';
import { SceneSchemaV7 } from './scene';

export const SequenceSchema = z.object({
  id: EntityIdSchema,
  actId: EntityIdSchema,
  order: z.number().int().positive(),
  title: z.string().trim().min(1).max(240),
  objective: z.string().max(12000).default(''),
  scenes: z.array(SceneSchemaV7).max(100).default([])
});

export type Sequence = z.infer<typeof SequenceSchema>;
