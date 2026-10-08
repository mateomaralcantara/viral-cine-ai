import { z } from 'zod';
import { EntityIdSchema } from './common';
import { ShotSchema } from './shot';

export const SceneSchemaV7 = z.object({
  id: EntityIdSchema,
  sequenceId: EntityIdSchema,
  order: z.number().int().positive(),
  title: z.string().trim().min(1).max(240),
  summary: z.string().max(12000).default(''),
  durationSeconds: z.number().positive().max(900),
  timeIndex: z.number().nonnegative().default(0),
  locationId: EntityIdSchema.optional(),
  characterIds: z.array(EntityIdSchema).max(100).default([]),
  narrativeGoal: z.string().max(6000).default(''),
  emotionalGoal: z.string().max(6000).default(''),
  continuityNotes: z.array(z.string().max(2000)).max(100).default([]),
  shots: z.array(ShotSchema).max(200).default([]),
  metadata: z.record(z.unknown()).default({})
});

export type SceneV7 = z.infer<typeof SceneSchemaV7>;
