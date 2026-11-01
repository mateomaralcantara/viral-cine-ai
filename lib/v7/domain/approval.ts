import { z } from 'zod';
import { ApprovalDecisionSchema, EntityIdSchema, TimestampSchema } from './common';

export const ApprovalTargetTypeSchema = z.enum([
  'take',
  'shot',
  'scene',
  'sequence',
  'act',
  'film',
  'master'
]);

export const ApprovalSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  targetType: ApprovalTargetTypeSchema,
  targetId: EntityIdSchema,
  decision: ApprovalDecisionSchema,
  approvedBy: z.string().trim().min(1).max(240),
  reason: z.string().max(8000).default(''),
  createdAt: TimestampSchema
});

export type Approval = z.infer<typeof ApprovalSchema>;
