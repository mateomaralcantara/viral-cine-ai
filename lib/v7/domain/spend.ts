import { z } from 'zod';
import { EntityIdSchema, MoneySchema, TimestampSchema } from './common';

export const SpendStateSchemaV7 = z.enum([
  'reserved',
  'submitted',
  'succeeded',
  'failed-no-charge',
  'failed-unknown',
  'reconciled'
]);

export const SpendEntrySchemaV7 = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  jobId: EntityIdSchema.optional(),
  takeId: EntityIdSchema.optional(),
  provider: z.string().trim().min(1).max(120),
  operation: z.string().trim().min(1).max(240),
  state: SpendStateSchemaV7,
  estimatedUsd: MoneySchema,
  actualUsd: MoneySchema.optional(),
  riskUsd: MoneySchema.default(0),
  idempotencyKey: z.string().trim().min(1).max(500),
  providerTaskId: z.string().trim().min(1).max(500).optional(),
  detail: z.string().max(8000).optional(),
  createdAt: TimestampSchema
});

export type SpendEntryV7 = z.infer<typeof SpendEntrySchemaV7>;
export type SpendStateV7 = z.infer<typeof SpendStateSchemaV7>;
