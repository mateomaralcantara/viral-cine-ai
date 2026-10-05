import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ensureProjectFolders,
  projectAssetDir,
  updateProject
} from '@/lib/storage/project-store';
import { safeErrorMessage } from '@/lib/engine/production-safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{ projectId: string }>;
};

const ApprovalSchema = z.object({
  characterId: z.string().min(1).max(120),
  approved: z.boolean()
});

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const form = await request.formData();

    const characterIdValue = form.get('characterId');
    const fileValue = form.get('file');

    if (typeof characterIdValue !== 'string' || !characterIdValue.trim()) {
      throw new Error('Falta characterId.');
    }

    if (!(fileValue instanceof File)) {
      throw new Error('Selecciona una imagen de referencia.');
    }

    if (!['image/jpeg', 'image/png'].includes(fileValue.type)) {
      throw new Error('La referencia debe ser JPG o PNG.');
    }

    if (fileValue.size <= 0) {
      throw new Error('La imagen está vacía.');
    }

    if (fileValue.size > MAX_IMAGE_BYTES) {
      throw new Error('La imagen supera el máximo de 8 MB.');
    }

    const characterId = characterIdValue.trim();

    const extension =
      fileValue.type === 'image/png'
        ? 'png'
        : 'jpg';

    const safeCharacterId =
      characterId.replace(/[^a-z0-9_-]/gi, '-').slice(0, 80) || 'character';

    const fileName =
      `identity-${safeCharacterId}-${Date.now()}.${extension}`;

    const relativeAsset = `uploads/${fileName}`;

    const bytes = Buffer.from(await fileValue.arrayBuffer());

    const project = await updateProject(projectId, async (current) => {
      if (!current.plan?.realMotion) {
        throw new Error('Este proyecto no tiene Real Motion 5.0.');
      }

      if (
        ['planning', 'queued', 'producing', 'composing'].includes(
          current.status
        )
      ) {
        throw new Error(
          'Identity Lock está bloqueado mientras el proyecto produce.'
        );
      }

      const entry = current.plan.realMotion.characterBible.find(
        (item) => item.characterId === characterId
      );

      if (!entry) {
        throw new Error(
          `El personaje ${characterId} no pertenece al Character Bible.`
        );
      }

      await ensureProjectFolders(projectId);

      await writeFile(
        path.join(projectAssetDir(projectId, 'uploads'), fileName),
        bytes
      );

      const characterBible =
        current.plan.realMotion.characterBible.map((item) =>
          item.characterId === characterId
            ? {
                ...item,
                masterReferenceAsset: relativeAsset,
                identityApproved: false,
                identityApprovedAt: undefined
              }
            : item
        );

      const characters = current.plan.characters.map((character) =>
        character.id === characterId
          ? {
              ...character,
              referenceAsset: relativeAsset
            }
          : character
      );

      current.plan = {
        ...current.plan,
        characters,
        realMotion: {
          ...current.plan.realMotion,
          characterBible
        }
      };

      current.productionLog = [
        ...current.productionLog,
        `${new Date().toISOString()} Identity Lock: referencia maestra actualizada para ${entry.name}. Aprobación reiniciada.`
      ];

      return current;
    });

    return NextResponse.json({
      ok: true,
      project
    });
  } catch (error) {
    return failure(error, 400);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const payload = ApprovalSchema.parse(await request.json());

    const project = await updateProject(projectId, (current) => {
      if (!current.plan?.realMotion) {
        throw new Error('Este proyecto no tiene Real Motion 5.0.');
      }

      if (
        ['planning', 'queued', 'producing', 'composing'].includes(
          current.status
        )
      ) {
        throw new Error(
          'Identity Lock está bloqueado mientras el proyecto produce.'
        );
      }

      const entry = current.plan.realMotion.characterBible.find(
        (item) => item.characterId === payload.characterId
      );

      if (!entry) {
        throw new Error('Personaje no encontrado en Character Bible.');
      }

      const fallbackReference =
        current.plan.characters.find(
          (character) => character.id === payload.characterId
        )?.referenceAsset;

      const reference =
        entry.masterReferenceAsset || fallbackReference;

      if (payload.approved && !reference) {
        throw new Error(
          `No puedes aprobar a ${entry.name} sin una referencia visual maestra.`
        );
      }

      const characterBible =
        current.plan.realMotion.characterBible.map((item) =>
          item.characterId === payload.characterId
            ? {
                ...item,
                ...(reference
                  ? { masterReferenceAsset: reference }
                  : {}),
                identityApproved: payload.approved,
                identityApprovedAt: payload.approved
                  ? new Date().toISOString()
                  : undefined
              }
            : item
        );

      current.plan = {
        ...current.plan,
        realMotion: {
          ...current.plan.realMotion,
          characterBible
        }
      };

      current.productionLog = [
        ...current.productionLog,
        `${new Date().toISOString()} Identity Lock: ${entry.name} ${
          payload.approved ? 'APROBADO' : 'DESBLOQUEADO'
        }.`
      ];

      return current;
    });

    return NextResponse.json({
      ok: true,
      project
    });
  } catch (error) {
    return failure(error, 400);
  }
}

function failure(error: unknown, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error: safeErrorMessage(error)
    },
    { status }
  );
}
