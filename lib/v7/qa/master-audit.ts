import type { Approval } from '@/lib/v7/domain/approval';
import type { FilmV7 } from '@/lib/v7/domain/film';
import type { Timeline } from '@/lib/v7/domain/timeline';
import type { QAResult } from './hierarchy';
import { aggregateQA } from './hierarchy';
import { buildMasterPlan } from '@/lib/v7/mastering/master-plan';

export type MasterAuditReport = {
  passed: boolean;
  blockers: string[];
  qaScore: number;
  durationSeconds: number;
  hasFilmApproval: boolean;
  hasMasterApproval: boolean;
};

export function auditMaster(input: {
  film: FilmV7;
  timeline: Timeline;
  qaResults: QAResult[];
  approvals: Approval[];
}): MasterAuditReport {
  const blockers: string[] = [];
  const qa = aggregateQA(input.qaResults);
  const master = buildMasterPlan(input.timeline);
  const hasFilmApproval = input.approvals.some((approval) =>
    approval.targetType === 'film' && approval.targetId === input.film.id && approval.decision === 'approved'
  );
  const hasMasterApproval = input.approvals.some((approval) =>
    approval.targetType === 'master' && approval.decision === 'approved'
  );

  if (!qa.passed) blockers.push('QA jerárquico no aprobado.');
  if (!hasFilmApproval) blockers.push('Falta aprobación humana de película.');
  if (!hasMasterApproval) blockers.push('Falta aprobación humana de master.');
  if (master.durationSeconds <= 0) blockers.push('Timeline sin duración final.');

  return {
    passed: blockers.length === 0,
    blockers,
    qaScore: qa.score,
    durationSeconds: master.durationSeconds,
    hasFilmApproval,
    hasMasterApproval
  };
}
