import { z } from 'zod';
import { EntityIdSchema } from './common';

export const CharacterV7Schema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  name: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(240),
  age: z.number().int().min(0).max(130).optional(),
  appearance: z.string().max(6000).default(''),
  personality: z.string().max(6000).default(''),
  identityLock: z.string().max(6000).default(''),
  immutableTraits: z.array(z.string().max(1000)).max(100).default([]),
  voiceProfileId: EntityIdSchema.optional(),
  metadata: z.record(z.unknown()).default({})
});

export type CharacterV7 = z.infer<typeof CharacterV7Schema>;
