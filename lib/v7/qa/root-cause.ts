import type { QAResult } from './hierarchy';

export type RepairTarget =
  | 'source-frame'
  | 'identity-reference'
  | 'video-take'
  | 'voice'
  | 'lip-sync'
  | 'audio-mix'
  | 'continuity-state'
  | 'timeline'
  | 'manual-review';

export function rootCauseRepairPlan(result: QAResult) {
  const targets = new Set<RepairTarget>();
  for (const issue of [...result.criticalFailures, ...result.issues].map((value) => value.toLowerCase())) {
    if (issue.includes('identidad') || issue.includes('rostro')) targets.add('identity-reference');
    else if (issue.includes('continuidad') || issue.includes('vestuario') || issue.includes('prop')) targets.add('continuity-state');
    else if (issue.includes('lip') || issue.includes('boca')) targets.add('lip-sync');
    else if (issue.includes('voz') || issue.includes('timbre')) targets.add('voice');
    else if (issue.includes('audio') || issue.includes('ruido')) targets.add('audio-mix');
    else if (issue.includes('timeline') || issue.includes('montaje') || issue.includes('ritmo')) targets.add('timeline');
    else if (issue.includes('movimiento') || issue.includes('anatom')) targets.add('video-take');
    else targets.add('manual-review');
  }
  return {
    regenerateOnly: [...targets],
    preserveUnaffectedAssets: true,
    autoRetryAllowed: false
  };
}
