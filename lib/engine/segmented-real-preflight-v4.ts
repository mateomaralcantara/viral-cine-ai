import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { buildSegmentedShotPlan } from '@/lib/engine/segmented-renderer-v4';
import { locateVoiceProfile } from '@/lib/engine/voice-casting-v4';
import { requiresLipSyncForSpeaker } from '@/lib/engine/lip-sync-policy-v4';
import { estimateOperationCost, voiceCostUnits } from '@/lib/engine/spend-ledger';
import { hasUsableCredential, isUsableCredentialValue } from '@/lib/engine/production-safety';
import { canAutoCastElevenLabsProfile } from '@/lib/engine/auto-voice-casting-v4';

export type SegmentedRealTurnPreflight = {
  index: number;
  speakerId: string;
  label: string;
  kind: 'narrator' | 'character' | 'support' | 'unknown';
  provider: 'elevenlabs' | 'openai' | 'offline' | 'unknown';
  text: string;
  durationSeconds: number;
  requiresLipSync: boolean;
  voiceIdReady: boolean;
  autoCastRequired: boolean;
  credentialName?: 'ELEVENLABS_API_KEY' | 'OPENAI_API_KEY';
  credentialVisible: boolean;
  voiceEstimatedUsd: number;
  lipSyncEstimatedUsd: number;
  blockers: string[];
};

export type SegmentedRealPreflight = {
  projectId: string;
  title: string;
  sceneOrder: number;
  shotOrder: number;
  shotId: string;
  sourceVideoAsset: string;
  shotDurationSeconds: number;
  turns: SegmentedRealTurnPreflight[];
  totals: {
    turns: number;
    voiceTurns: number;
    lipSyncTurns: number;
    lipSyncSeconds: number;
    voiceEstimatedUsd: number;
    lipSyncEstimatedUsd: number;
    totalEstimatedUsd: number;
    profilesRequired: number;
    profilesReady: number;
    profilesAutoCast: number;
    blockers: number;
  };
  requiredProfiles: Array<{
    speakerId: string;
    label: string;
    kind: 'narrator' | 'character' | 'support' | 'unknown';
    provider: 'elevenlabs' | 'openai' | 'offline' | 'unknown';
    voiceIdReady: boolean;
    autoCastRequired: boolean;
  }>;
  blockers: string[];
};

export function buildSegmentedRealPreflight(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
): SegmentedRealPreflight {
  const plan = buildSegmentedShotPlan(project, scene, shot);
  const rows: SegmentedRealTurnPreflight[] = plan.turns.map((turn) => {
    const located = locateVoiceProfile(project, turn.speakerId);
    const profile = located?.profile;
    const provider = profile?.voiceProvider || 'elevenlabs';
    const label = located?.label || (turn.speakerId === 'narrator' ? 'Narrador' : turn.speakerId);
    const kind = located?.kind || (turn.speakerId === 'narrator' ? 'narrator' : 'unknown');
    const blockers: string[] = [];
    let credentialName: SegmentedRealTurnPreflight['credentialName'];
    let voiceIdReady = false;
    let autoCastRequired = false;

    if (!located) blockers.push(`${label}: no existe un perfil vocal persistente.`);

    if (provider === 'elevenlabs') {
      credentialName = 'ELEVENLABS_API_KEY';
      voiceIdReady =
        isUsableCredentialValue(profile?.voiceId) ||
        (
          turn.speakerId === 'narrator' &&
          isUsableCredentialValue(process.env.ELEVENLABS_NARRATOR_VOICE_ID)
        );
    } else if (provider === 'openai') {
      credentialName = 'OPENAI_API_KEY';
      voiceIdReady = true;
    } else if (provider === 'offline') {
      blockers.push(`${label}: proveedor offline no es válido para el piloto real.`);
    } else {
      blockers.push(`${label}: proveedor vocal desconocido.`);
    }

    const credentialVisible = credentialName ? hasUsableCredential(credentialName) : false;
    if (credentialName && !credentialVisible) blockers.push(`${label}: falta ${credentialName}.`);

    if (
      located &&
      provider === 'elevenlabs' &&
      !voiceIdReady &&
      credentialVisible &&
      canAutoCastElevenLabsProfile(project, turn.speakerId)
    ) {
      autoCastRequired = true;
    } else if (located && provider === 'elevenlabs' && !voiceIdReady) {
      blockers.push(`${label}: falta voiceId persistente de ElevenLabs.`);
    }

    const requiresLipSync = requiresLipSyncForSpeaker(project, turn.speakerId);
    const voiceEstimatedUsd = estimateOperationCost('voice', voiceCostUnits(turn.text));
    const lipSyncEstimatedUsd =
      requiresLipSync && !localLipSyncOnly()
        ? estimateOperationCost('lip-sync', turn.durationSeconds)
        : 0;

    if (
      requiresLipSync &&
      !localLipSyncOnly() &&
      process.env.ENABLE_LIPSYNC === 'false'
    ) {
      blockers.push(`${label}: ENABLE_LIPSYNC=false.`);
    }

    return {
      index: turn.index,
      speakerId: turn.speakerId,
      label,
      kind,
      provider: provider as SegmentedRealTurnPreflight['provider'],
      text: turn.text,
      durationSeconds: turn.durationSeconds,
      requiresLipSync,
      voiceIdReady,
      autoCastRequired,
      credentialName,
      credentialVisible,
      voiceEstimatedUsd,
      lipSyncEstimatedUsd,
      blockers
    };
  });

  const profileMap = new Map<string, SegmentedRealPreflight['requiredProfiles'][number]>();
  for (const row of rows) {
    if (!profileMap.has(row.speakerId)) {
      profileMap.set(row.speakerId, {
        speakerId: row.speakerId,
        label: row.label,
        kind: row.kind,
        provider: row.provider,
        voiceIdReady: row.voiceIdReady,
        autoCastRequired: row.autoCastRequired
      });
    }
  }

  const blockers = rows.flatMap((row) => row.blockers);
  if (
    rows.some((row) => row.requiresLipSync) &&
    !localLipSyncOnly() &&
    !hasUsableCredential('FAL_KEY')
  ) {
    blockers.push('Lip-sync: falta FAL_KEY.');
  }

  const uniqueBlockers = unique(blockers);
  const lipSyncSeconds = rows
    .filter((row) => row.requiresLipSync)
    .reduce((sum, row) => sum + row.durationSeconds, 0);
  const voiceEstimatedUsd = sumMoney(rows.map((row) => row.voiceEstimatedUsd));
  const lipSyncEstimatedUsd = sumMoney(rows.map((row) => row.lipSyncEstimatedUsd));
  const requiredProfiles = [...profileMap.values()];

  return {
    projectId: project.id,
    title: project.input.title,
    sceneOrder: scene.order,
    shotOrder: shot.order,
    shotId: shot.id,
    sourceVideoAsset: plan.sourceVideoAsset,
    shotDurationSeconds: plan.shotDurationSeconds,
    turns: rows,
    totals: {
      turns: rows.length,
      voiceTurns: rows.length,
      lipSyncTurns: rows.filter((row) => row.requiresLipSync).length,
      lipSyncSeconds: round(lipSyncSeconds),
      voiceEstimatedUsd,
      lipSyncEstimatedUsd,
      totalEstimatedUsd: sumMoney([voiceEstimatedUsd, lipSyncEstimatedUsd]),
      profilesRequired: requiredProfiles.length,
      profilesReady: requiredProfiles.filter((profile) => profile.voiceIdReady).length,
      profilesAutoCast: requiredProfiles.filter((profile) => profile.autoCastRequired).length,
      blockers: uniqueBlockers.length
    },
    requiredProfiles,
    blockers: uniqueBlockers
  };
}

function sumMoney(values: number[]) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 10000) / 10000;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function unique(values: string[]) {
  return [...new Set(values)];
}


function localLipSyncOnly() {
  return /^(?:1|true|yes|on)$/i.test(
    String(process.env.VIRALCINE_LOCAL_LIPSYNC_ONLY || '').trim()
  );
}
