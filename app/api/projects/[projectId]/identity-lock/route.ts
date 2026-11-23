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

type Context = { params: Promise<{ projectId: string }> };

const ReferenceKindSchema = z.enum(['face', 'body']);

const ApprovalSchema = z.object({
  characterId: z.string().min(1).max(120),
  kind: ReferenceKindSchema.default('face'),
  approved: z.boolean()
});

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const form = await request.formData();
    const characterIdValue = form.get('characterId');
    const kindValue = form.get('kind');
    const fileValue = form.get('file');

    if (typeof characterIdValue !== 'string' || !characterIdValue.trim()) {
      throw new Error('Falta characterId.');
    }

    const kind = ReferenceKindSchema.parse(
      typeof kindValue === 'string' && kindValue ? kindValue : 'face'
    );

    if (!(fileValue instanceof File)) {
      throw new Error('Selecciona una imagen de referencia.');
    }
    if (!['image/jpeg', 'image/png'].includes(fileValue.type)) {
      throw new Error('La referencia debe ser JPG o PNG.');
    }
    if (fileValue.size <= 0) throw new Error('La imagen está vacía.');
    if (fileValue.size > MAX_IMAGE_BYTES) {
      throw new Error('La imagen supera el máximo de 8 MB.');
    }

    const characterId = characterIdValue.trim();
    const extension = fileValue.type === 'image/png' ? 'png' : 'jpg';
    const safeCharacterId =
      characterId.replace(/[^a-z0-9_-]/gi, '-').slice(0, 80) || 'character';
    const fileName =
      `identity-${kind}-${safeCharacterId}-${Date.now()}.${extension}`;
    const relativeAsset = `uploads/${fileName}`;
    const bytes = Buffer.from(await fileValue.arrayBuffer());

    const project = await updateProject(projectId, async (current) => {
      if (!current.plan?.realMotion) {
        throw new Error('Este proyecto no tiene Real Motion 5.0.');
      }
      if (['planning', 'queued', 'producing', 'composing'].includes(current.status)) {
        throw new Error('Identity Lock está bloqueado mientras el proyecto produce.');
      }

      const entry = current.plan.realMotion.characterBible.find(
        (item) => item.characterId === characterId
      );
      if (!entry) {
        throw new Error(`El personaje ${characterId} no pertenece al Character Bible.`);
      }

      await ensureProjectFolders(projectId);
      await writeFile(
        path.join(projectAssetDir(projectId, 'uploads'), fileName),
        bytes
      );

      const characterBible = current.plan.realMotion.characterBible.map((item) => {
        if (item.characterId !== characterId) return item;

        if (kind === 'body') {
          return {
            ...item,
            bodyReferenceAsset: relativeAsset,
            bodyApproved: false,
            bodyApprovedAt: undefined
          };
        }

        return {
          ...item,
          masterReferenceAsset: relativeAsset,
          faceApproved: false,
          faceApprovedAt: undefined,
          bodyApproved: false,
          bodyApprovedAt: undefined,
          identityApproved: false,
          identityApprovedAt: undefined
        };
      });

      const characters = kind === 'face'
        ? current.plan.characters.map((character) =>
            character.id === characterId
              ? { ...character, referenceAsset: relativeAsset }
              : character
          )
        : current.plan.characters;

      current.plan = {
        ...current.plan,
        characters,
        realMotion: { ...current.plan.realMotion, characterBible }
      };

      current.productionLog = [
        ...current.productionLog,
        `${new Date().toISOString()} Identity Lock: ${kind === 'face' ? 'FACE MASTER' : 'BODY MASTER'} actualizado para ${entry.name}. Aprobación correspondiente reiniciada.`
      ];
      return current;
    });

    return NextResponse.json({ ok: true, project });
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
      if (['planning', 'queued', 'producing', 'composing'].includes(current.status)) {
        throw new Error('Identity Lock está bloqueado mientras el proyecto produce.');
      }

      const entry = current.plan.realMotion.characterBible.find(
        (item) => item.characterId === payload.characterId
      );
      if (!entry) throw new Error('Personaje no encontrado en Character Bible.');

      const fallbackFaceReference = current.plan.characters.find(
        (character) => character.id === payload.characterId
      )?.referenceAsset;
      const faceReference = entry.masterReferenceAsset || fallbackFaceReference;
      const bodyReference = entry.bodyReferenceAsset;

      if (payload.kind === 'face' && payload.approved && !faceReference) {
        throw new Error(`No puedes aprobar el FACE MASTER de ${entry.name} sin referencia.`);
      }
      if (payload.kind === 'body' && payload.approved && !bodyReference) {
        throw new Error(`No puedes aprobar el BODY MASTER de ${entry.name} sin referencia.`);
      }

      const now = new Date().toISOString();
      const characterBible = current.plan.realMotion.characterBible.map((item) => {
        if (item.characterId !== payload.characterId) return item;

        if (payload.kind === 'body') {
          return {
            ...item,
            bodyApproved: payload.approved,
            bodyApprovedAt: payload.approved ? now : undefined
          };
        }

        return {
          ...item,
          ...(faceReference ? { masterReferenceAsset: faceReference } : {}),
          faceApproved: payload.approved,
          faceApprovedAt: payload.approved ? now : undefined,
          identityApproved: payload.approved,
          identityApprovedAt: payload.approved ? now : undefined
        };
      });

      current.plan = {
        ...current.plan,
        realMotion: { ...current.plan.realMotion, characterBible }
      };

      current.productionLog = [
        ...current.productionLog,
        `${now} Identity Lock: ${entry.name} ${payload.kind === 'face' ? 'FACE MASTER' : 'BODY MASTER'} ${payload.approved ? 'APROBADO' : 'DESBLOQUEADO'}.`
      ];
      return current;
    });

    return NextResponse.json({ ok: true, project });
  } catch (error) {
    return failure(error, 400);
  }
}

function failure(error: unknown, status: number) {
  return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status });
}
