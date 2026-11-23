import { z } from 'zod';
import { EntityIdSchema, LifecycleStatusSchema, MoneySchema, TimestampSchema } from './common';

export const GenerationJobTypeSchema = z.enum([
  'story.plan',
  'script.write',
  'continuity.resolve',
  'image.generate',
  'video.generate',
  'voice.generate',
  'lipsync.generate',
  'audio.mix',
  'qa.take',
  'qa.shot',
  'qa.scene',
  'qa.sequence',
  'qa.act',
  'qa.film',
  'timeline.compose',
  'master.export'
]);

export const GenerationJobSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  type: GenerationJobTypeSchema,
  sceneId: EntityIdSchema.optional(),
  shotId: EntityIdSchema.optional(),
  takeId: EntityIdSchema.optional(),
  provider: z.string().trim().min(1).max(120).optional(),
  status: LifecycleStatusSchema,
  priority: z.number().int().min(-100).max(100).default(0),
  dependsOn: z.array(EntityIdSchema).max(1000).default([]),
  estimatedCostUsd: MoneySchema.default(0),
  actualCostUsd: MoneySchema.optional(),
  idempotencyKey: z.string().trim().min(1).max(500),
  providerTaskId: z.string().trim().min(1).max(500).optional(),
  attempt: z.number().int().nonnegative().default(0),
  maxAttempts: z.number().int().min(1).max(20).default(1),
  failureClassification: z.string().max(240).optional(),
  createdAt: TimestampSchema,
  startedAt: TimestampSchema.optional(),
  completedAt: TimestampSchema.optional()
});

export type GenerationJob = z.infer<typeof GenerationJobSchema>;
export type GenerationJobType = z.infer<typeof GenerationJobTypeSchema>;
