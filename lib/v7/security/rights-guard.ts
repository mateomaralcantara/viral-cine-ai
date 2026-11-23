import type { RightsGrant } from '@/lib/v7/domain/rights';

export function assertRightsReady(
  grants: readonly RightsGrant[],
  required: Array<{ subjectType: RightsGrant['subjectType']; subjectId: string }>
) {
  const blockers: string[] = [];
  for (const item of required) {
    const grant = grants
      .filter((candidate) =>
        candidate.subjectType === item.subjectType &&
        candidate.subjectId === item.subjectId
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    if (!grant || !['owned', 'licensed', 'consented'].includes(grant.status)) {
      blockers.push(item.subjectType + ':' + item.subjectId);
    }
  }
  if (blockers.length) {
    throw new Error('V7_RIGHTS_BLOCKED: ' + blockers.join(', '));
  }
  return true;
}
