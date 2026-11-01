import { z } from 'zod';
import { EntityIdSchema, LifecycleStatusSchema, MoneySchema, TimestampSchema } from './common';

export const TakeFailureClassificationSchema = z.enum([
  'safe-no-charge',
  'billing-risk-unknown',
  'provider-rejected',
  'quality-rejected',
  'continuity-rejected',
  'technical-failure',
  'cancelled'
]);

export const TakeSchema = z.object({
  id: EntityIdSchema,
  shotId: EntityIdSchema,
  version: z.number().int().positive(),
  status: LifecycleStatusSchema,
  provider: z.string().trim().min(1).max(120).optional(),
  providerModel: z.string().trim().min(1).max(200).optional(),
  providerTaskId: z.string().trim().min(1).max(500).optional(),
  generationJobId: EntityIdSchema.optional(),
  videoAssetId: EntityIdSchema.optional(),
  audioAssetId: EntityIdSchema.optional(),
  imageAssetId: EntityIdSchema.optional(),
  estimatedCostUsd: MoneySchema.default(0),
  actualCostUsd: MoneySchema.optional(),
  qualityScore: z.number().min(0).max(10).optional(),
  qualityReportId: EntityIdSchema.optional(),
  createdAt: TimestampSchema,
  approvedAt: TimestampSchema.optional(),
  rejectedAt: TimestampSchema.optional(),
  failureClassification: TakeFailureClassificationSchema.optional(),
  failureDetail: z.string().max(8000).optional(),
  legacyVideoAssetPath: z.string().max(4000).optional()
});

export type Take = z.infer<typeof TakeSchema>;
