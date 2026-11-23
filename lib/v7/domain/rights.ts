import { z } from 'zod';
import { EntityIdSchema, TimestampSchema } from './common';

export const RightsGrantSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema.optional(),
  subjectType: z.enum(['actor', 'voice', 'asset', 'music', 'location']),
  subjectId: EntityIdSchema,
  status: z.enum(['unknown', 'owned', 'licensed', 'consented', 'restricted', 'expired']),
  territories: z.array(z.string().trim().min(1).max(120)).max(250).default(['worldwide']),
  allowedUses: z.array(z.string().trim().min(1).max(240)).max(250).default([]),
  consentReference: z.string().max(4000).optional(),
  validFrom: TimestampSchema.optional(),
  validUntil: TimestampSchema.optional(),
  createdAt: TimestampSchema
});

export type RightsGrant = z.infer<typeof RightsGrantSchema>;
