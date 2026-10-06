import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { FilmPlanSchema } from '@/lib/domain/schemas';
import {
  FIFTEEN_DAYS_SHORT_INPUT_V5,
  buildFifteenDaysShortPlanV5
} from '@/lib/production-presets/fifteen-days-short-v5';
import {
  getProject,
  projectAssetDir,
  updateProject
} from '@/lib/storage/project-store';
import { safeErrorMessage } from '@/lib/engine/production-safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ projectId: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const before = await getProject(projectId);

    if (before.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
      throw new Error('Este compactador solo está autorizado para el proyecto 15 DÍAS.');
    }
    if (!before.plan?.realMotion) {
      throw new Error('15 DÍAS no tiene plan Real Motion para conservar identidades.');
    }

    const checkpoints = projectAssetDir(projectId, 'checkpoints');
    await mkdir(checkpoints, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(
      checkpoints,
      `project-before-short-150s-${stamp}.json`
    );
    await writeFile(backupPath, JSON.stringify(before, null, 2) + '\n', 'utf8');

    const compact = FilmPlanSchema.parse(buildFifteenDaysShortPlanV5());

    const oldCharacters = new Map(
      before.plan.characters.map((character) => [character.id, character])
    );
    compact.characters = compact.characters.map((character) => {
      const old = oldCharacters.get(character.id);
      return old?.referenceAsset
        ? { ...character, referenceAsset: old.referenceAsset }
        : character;
    });

    const oldBible = new Map(
      before.plan.realMotion.characterBible.map((entry) => [entry.characterId, entry])
    );
    compact.realMotion!.characterBible = compact.realMotion!.characterBible.map(
      (entry) => {
        const old = oldBible.get(entry.characterId);
        if (!old) return entry;
        return {
          ...entry,
          masterReferenceAsset: old.masterReferenceAsset,
          bodyReferenceAsset: old.bodyReferenceAsset,
          identityApproved: old.identityApproved,
          identityApprovedAt: old.identityApprovedAt,
          bodyApproved: old.bodyApproved,
          bodyApprovedAt: old.bodyApprovedAt
        };
      }
    );

    const previousShotOne = before.plan.scenes
      .flatMap((scene) => scene.shots)
      .find((shot) => shot.id === 'pilot-15d-01');
    const compactShotOne = compact.scenes
      .flatMap((scene) => scene.shots)
      .find((shot) => shot.id === 'pilot-15d-01');

    if (previousShotOne && compactShotOne) {
      Object.assign(compactShotOne, {
        ...previousShotOne,
        title: compactShotOne.title,
        order: compactShotOne.order,
        characterIds: compactShotOne.characterIds,
        characterStateIds:
          previousShotOne.characterStateIds || compactShotOne.characterStateIds,
        videoModelOverride: undefined,
        qualityForceRegenerate: false,
        motionSpec: previousShotOne.motionSpec
          ? {
              ...previousShotOne.motionSpec,
              preferredProviders: ['fal-video'],
              allowStillFallbackFinal: false
            }
          : compactShotOne.motionSpec
      });
    }

    const totalSeconds = compact.scenes.reduce(
      (sum, scene) => sum + scene.durationSeconds,
      0
    );
    const totalShots = compact.scenes.reduce(
      (sum, scene) => sum + scene.shots.length,
      0
    );

    const project = await updateProject(projectId, (current) => ({
      ...current,
      input: {
        ...current.input,
        ...FIFTEEN_DAYS_SHORT_INPUT_V5
      },
      plan: compact,
      status: 'planned',
      pilot: {
        enabled: true,
        maxScenes: 1,
        maxShotsPerScene: 1,
        maxSpendUsd: Math.max(current.pilot?.maxSpendUsd || 1, 1.5),
        approvedForFullProduction: false
      },
      progress: {
        phase: 'short-150-ready',
        percent: 8,
        message:
          '15 DÍAS reducido a 2:30. Fal queda como proveedor temporal; solo E1/T1 está autorizada para la próxima prueba.',
        currentScene: 1,
        totalScenes: compact.scenes.length,
        updatedAt: new Date().toISOString()
      },
      error: undefined,
      productionLog: [
        ...current.productionLog,
        `${new Date().toISOString()} 15 DÍAS compactado a ${totalSeconds}s (${compact.scenes.length} escenas / ${totalShots} tomas). Backup: ${path.basename(backupPath)}.`,
        `${new Date().toISOString()} Ruta temporal del corto: Fal.ai únicamente. Producción masiva sigue bloqueada hasta aprobar E1/T1.`
      ]
    }));

    return NextResponse.json({
      ok: true,
      project,
      short: {
        seconds: totalSeconds,
        minutes: totalSeconds / 60,
        scenes: compact.scenes.length,
        shots: totalShots,
        provider: 'fal-video',
        backup: path.basename(backupPath)
      }
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: safeErrorMessage(error) },
      { status: 400 }
    );
  }
}
