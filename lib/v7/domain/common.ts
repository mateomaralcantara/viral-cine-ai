import { z } from 'zod';

export const EntityIdSchema = z.string().trim().min(1).max(180);
export const TimestampSchema = z.string().trim().min(1).max(80);
export const MoneySchema = z.number().nonnegative().finite();
export const JsonRecordSchema = z.record(z.unknown());

export const LifecycleStatusSchema = z.enum([
  'draft',
  'planned',
  'ready',
  'reserved',
  'submitted',
  'processing',
  'succeeded',
  'failed-no-charge',
  'failed-unknown',
  'review-required',
  'approved',
  'rejected',
  'cancelled'
]);

export const ApprovalDecisionSchema = z.enum(['approved', 'rejected', 'changes-requested']);
export const VersionStatusSchema = z.enum(['draft', 'review', 'approved', 'superseded', 'archived']);

export type LifecycleStatus = z.infer<typeof LifecycleStatusSchema>;
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
export type VersionStatus = z.infer<typeof VersionStatusSchema>;
