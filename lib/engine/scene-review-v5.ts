import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { buildVoiceCastingState } from '@/lib/engine/voice-casting-v4';
import { estimatePilotShotSpend } from '@/lib/engine/pilot';
import { inspectProjectMusic } from '@/lib/engine/project-music-v4';
import { reservedMovieSpend } from '@/lib/engine/spend-ledger';

export type SceneReviewShotManifest = {
  id: string;
  order: number;
  title: string;
  durationSeconds: number;
  spokenText: string;
  speakerId?: string;
  estimatedUsd: number;
  currentStatus: string;
  hasExistingVideo: boolean;
  qualityScore?: number;
};

export type SceneReviewVoiceLock = {
  id: string;
  label: string;
  provider: string;
  voiceId?: string;
  ready: boolean;
  exactLockReady: boolean;
};

export type SceneReviewManifestV5 = {
  projectId: string;
  title: string;
  sceneOrder: number;
  sceneTitle: string;
  durationSeconds: number;
  shotCount: number;
  shots: SceneReviewShotManifest[];
  voices: SceneReviewVoiceLock[];
  sound: {
    dialogueAndLipSync: 'integrated';
    projectMusic: 'ready' | 'will-generate' | 'disabled';
    ambienceAndSfx: 'planned-manifest';
    note: string;
  };
  spend: {
    currentReservedUsd: number;
    estimatedSceneUsd: number;
    estimatedMusicUsd: number;
    projectedUsd: number;
    projectBudgetUsd: number;
  };
  blockers: string[];
  ready: boolean;
};

export async function buildSceneReviewManifestV5(
  project: FilmProject,
  sceneOrder: number
): Promise<SceneReviewManifestV5> {
  if (!project.plan) throw new Error('El proyecto no tiene plan.');

  const scene = project.plan.scenes.find((item) => item.order === sceneOrder);
  if (!scene) throw new Error(`No existe la escena ${sceneOrder}.`);

  const blockers: string[] = [];
  const previousScenes = project.plan.scenes
    .filter((item) => item.order < sceneOrder)
    .sort((a, b) => a.order - b.order);

  for (const previous of previousScenes) {
    if (previous.status !== 'ready') {
      blockers.push(
        `Escena ${previous.order} “${previous.title}” todavía no está aprobada/ready.`
      );
    }
  }

  const voiceState = buildVoiceCastingState(project);
  const speakingIds = new Set(
    scene.shots
      .filter((shot) => Boolean(shot.spokenText.trim()))
      .map((shot) => shot.speakerId)
      .filter((value): value is string => Boolean(value))
  );

  const voices: SceneReviewVoiceLock[] = [];
  for (const speakerId of speakingIds) {
    const profile = voiceState.profiles.find((item) => item.id === speakerId);
    if (!profile) {
      blockers.push(`No existe perfil vocal para ${speakerId}.`);
      continue;
    }

    const exactLockReady =
      profile.voiceReady &&
      profile.voiceProvider === 'openai' &&
      Boolean(profile.voiceId?.trim()) &&
      /no traduzcas/i.test(profile.voiceInstructions || '') &&
      /exactamente/i.test(profile.voiceInstructions || '');

    voices.push({
      id: profile.id,
      label: profile.label,
      provider: profile.voiceProvider,
      voiceId: profile.voiceId,
      ready: profile.voiceReady,
      exactLockReady
    });

    if (!profile.voiceReady) {
      blockers.push(`Voz ${profile.label}: casting no está listo.`);
    } else if (!exactLockReady) {
      blockers.push(
        `Voz ${profile.label}: falta Voice Lock 5.0 explícito (OpenAI + voiceId + español exacto sin traducción).`
      );
    }
  }

  const shots: SceneReviewShotManifest[] = scene.shots.map((shot) => ({
    id: shot.id,
    order: shot.order,
    title: shot.title,
    durationSeconds: shot.durationSeconds,
    spokenText: shot.spokenText,
    speakerId: shot.speakerId,
    estimatedUsd:
      shot.status === 'ready' && shot.videoAsset
        ? 0
        : estimatePilotShotSpend(shot),
    currentStatus: shot.status,
    hasExistingVideo: Boolean(shot.videoAsset),
    qualityScore: shot.qualityScore
  }));

  const estimatedSceneUsd = round(
    shots.reduce((sum, shot) => sum + shot.estimatedUsd, 0)
  );
  const currentReservedUsd = await reservedMovieSpend(project.id);
  const music = await inspectProjectMusic(project);
  const estimatedMusicUsd =
    project.input.generateMusic && !music.ready
      ? music.estimatedUsd
      : 0;
  const projectedUsd = round(
    currentReservedUsd + estimatedSceneUsd + estimatedMusicUsd
  );

  if (projectedUsd > project.input.budgetUsd + 0.0001) {
    blockers.push(
      `Presupuesto: proyección US$${projectedUsd.toFixed(2)} supera límite del proyecto US$${project.input.budgetUsd.toFixed(2)}.`
    );
  }

  for (const shot of scene.shots) {
    if ((shot.preflightIssues || []).length) {
      blockers.push(
        `T${shot.order}: ${(shot.preflightIssues || []).join(' | ')}`
      );
    }
  }

  return {
    projectId: project.id,
    title: project.input.title,
    sceneOrder,
    sceneTitle: scene.title,
    durationSeconds: scene.durationSeconds,
    shotCount: scene.shots.length,
    shots,
    voices,
    sound: {
      dialogueAndLipSync: 'integrated',
      projectMusic: project.input.generateMusic
        ? music.ready
          ? 'ready'
          : 'will-generate'
        : 'disabled',
      ambienceAndSfx: 'planned-manifest',
      note:
        'Scene Review 5.0 integra diálogo, lip-sync y score. Ambiente/SFX permanecen descritos por soundDesign hasta activar un proveedor dedicado; no se simulan ni se inventan efectos.'
    },
    spend: {
      currentReservedUsd,
      estimatedSceneUsd,
      estimatedMusicUsd,
      projectedUsd,
      projectBudgetUsd: project.input.budgetUsd
    },
    blockers,
    ready: blockers.length === 0
  };
}

export function printSceneReviewManifestV5(
  manifest: SceneReviewManifestV5
) {
  console.log('\n==================================================');
  console.log(' VIRALCINE — SCENE REVIEW 5.0 MANIFEST');
  console.log('==================================================');
  console.log(
    `Escena ${manifest.sceneOrder}: ${manifest.sceneTitle} · ${manifest.durationSeconds}s · ${manifest.shotCount} tomas`
  );

  console.log('\nTOMAS');
  for (const shot of manifest.shots) {
    console.log(
      `- T${shot.order} · ${shot.durationSeconds}s · ${shot.title} · ` +
      `speaker=${shot.speakerId || 'sin voz'} · estimado=US$${shot.estimatedUsd.toFixed(2)} · estado=${shot.currentStatus}`
    );
    if (shot.spokenText.trim()) {
      console.log('  texto exacto: ' + shot.spokenText);
    }
  }

  console.log('\nVOICE LOCKS');
  if (!manifest.voices.length) {
    console.log('- Sin voces habladas en esta escena.');
  }
  for (const voice of manifest.voices) {
    console.log(
      `- ${voice.label} · ${voice.provider} · voice=${voice.voiceId || 'SIN ASIGNAR'} · lock=${voice.exactLockReady ? 'OK' : 'BLOQUEADO'}`
    );
  }

  console.log('\nSONIDO');
  console.log('- diálogo/lip-sync: integrado');
  console.log('- música: ' + manifest.sound.projectMusic);
  console.log('- ambiente/SFX: ' + manifest.sound.ambienceAndSfx);
  console.log('- ' + manifest.sound.note);

  console.log('\nPRESUPUESTO');
  console.log(
    '- gasto contabilizado previo: US$' +
      manifest.spend.currentReservedUsd.toFixed(4)
  );
  console.log(
    '- escena estimada: US$' +
      manifest.spend.estimatedSceneUsd.toFixed(4)
  );
  console.log(
    '- música adicional estimada: US$' +
      manifest.spend.estimatedMusicUsd.toFixed(4)
  );
  console.log(
    '- proyección: US$' +
      manifest.spend.projectedUsd.toFixed(4) +
      ' / US$' +
      manifest.spend.projectBudgetUsd.toFixed(2)
  );

  if (manifest.blockers.length) {
    console.log('\nBLOQUEOS');
    for (const blocker of manifest.blockers) {
      console.log('- ' + blocker);
    }
  }

  console.log(
    '\nSCENE_REVIEW_READY=' + (manifest.ready ? 'YES' : 'NO')
  );
}

export function sceneForReview(
  project: FilmProject,
  sceneOrder: number
): FilmScene {
  const scene = project.plan?.scenes.find((item) => item.order === sceneOrder);
  if (!scene) throw new Error(`No existe la escena ${sceneOrder}.`);
  return scene;
}

export function markSceneForIntegratedRun(
  project: FilmProject,
  sceneOrder: number
) {
  const scene = sceneForReview(project, sceneOrder);

  scene.status = 'pending';
  scene.error = undefined;
  scene.qualityIssues = undefined;
  scene.qualityReportAsset = undefined;
  scene.qualityOverrideApproved = undefined;

  for (const shot of scene.shots) {
    if (shot.status === 'ready' && shot.videoAsset) continue;
    shot.status = 'pending';
    shot.error = undefined;
    shot.qualityOverrideApproved = undefined;
  }

  project.status = 'queued';
  project.error = undefined;
  project.progress = {
    phase: 'queued',
    percent: 0,
    message:
      `Scene Review 5.0: escena ${scene.order} “${scene.title}” autorizada como unidad completa; reparación posterior seguirá siendo por toma.`,
    currentScene: scene.order,
    totalScenes: project.plan?.scenes.length,
    updatedAt: new Date().toISOString()
  };

  project.productionLog.push(
    new Date().toISOString() +
      ` Scene Review 5.0 armado para escena ${scene.order}: revisión por escena completa, reparación selectiva por toma.`
  );

  return scene;
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}
