import type { LifecycleStatus } from '@/lib/v7/domain/common';
const allowed: Record<LifecycleStatus, LifecycleStatus[]> = {
  draft: ['planned', 'cancelled'],
  planned: ['ready', 'cancelled'],
  ready: ['reserved', 'processing', 'cancelled'],
  reserved: ['submitted', 'failed-no-charge', 'failed-unknown', 'cancelled'],
  submitted: ['processing', 'succeeded', 'failed-no-charge', 'failed-unknown'],
  processing: ['succeeded', 'failed-no-charge', 'failed-unknown', 'review-required'],
  succeeded: ['review-required', 'approved', 'rejected'],
  'failed-no-charge': ['ready', 'cancelled'],
  'failed-unknown': ['cancelled'],
  'review-required': ['approved', 'rejected'],
  approved: [],
  rejected: ['ready', 'cancelled'],
  cancelled: []
};
export function canTransition(from: LifecycleStatus, to: LifecycleStatus) {
  return allowed[from].includes(to);
}
export function assertTransition(from: LifecycleStatus, to: LifecycleStatus) {
  if (!canTransition(from, to)) throw new Error('Transición V7 inválida: ' + from + ' -> ' + to);
}
