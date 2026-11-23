import { z } from 'zod';
import { EntityIdSchema, JsonRecordSchema, TimestampSchema } from './common';

export const AuditEventSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  actor: z.string().trim().min(1).max(240),
  action: z.string().trim().min(1).max(240),
  targetType: z.string().trim().min(1).max(120),
  targetId: EntityIdSchema,
  before: JsonRecordSchema.optional(),
  after: JsonRecordSchema.optional(),
  reason: z.string().max(8000).default(''),
  createdAt: TimestampSchema
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;
