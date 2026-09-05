import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  applySafeSpeakerSuggestions,
  applySpeakerAssignment,
  buildCastingState,
  clearSpeakerAssignment,
  setCharacterVoice
} from '@/lib/engine/casting-v4';
import { safeErrorMessage } from '@/lib/engine/production-safety';
import { getProject, updateProject } from '@/lib/storage/project-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ projectId: string }> };

const ActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('assign-speaker'),
    shotId: z.string().min(1),
    speakerId: z.string().min(1)
  }),
  z.object({
    action: z.literal('clear-speaker'),
    shotId: z.string().min(1)
  }),
  z.object({
    action: z.literal('apply-safe'),
    minimumConfidence: z.number().min(0.8).max(1).default(0.92)
  }),
  z.object({
    action: z.literal('set-voice'),
    characterId: z.string().min(1),
    provider: z.enum(['elevenlabs', 'openai', 'offline']),
    voiceId: z.string().max(200).optional(),
    stability: z.number().min(0).max(1).optional(),
    similarity: z.number().min(0).max(1).optional(),
    style: z.number().min(0).max(1).optional(),
    speed: z.number().min(0.7).max(1.2).optional()
  })
]);

export async function GET(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const project = await getProject(projectId);
    return NextResponse.json({ ok: true, casting: buildCastingState(project) });
  } catch (error) {
    return failure(error, 404);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const payload = ActionSchema.parse(await request.json());
    let applied = 0;
    const project = await updateProject(projectId, (current) => {
      if (!current.plan) throw new Error('El proyecto no tiene plan todavía.');
      if (['planning', 'queued', 'producing', 'composing'].includes(current.status)) {
        throw new Error('Casting bloqueado mientras el proyecto está planificando o produciendo.');
      }

      switch (payload.action) {
        case 'assign-speaker':
          applySpeakerAssignment(current, payload.shotId, payload.speakerId, 'manual', 1);
          break;
        case 'clear-speaker':
          clearSpeakerAssignment(current, payload.shotId);
          break;
        case 'apply-safe':
          applied = applySafeSpeakerSuggestions(current, payload.minimumConfidence);
          current.productionLog.push(
            `${new Date().toISOString()} Reconciliador 4.0 aplicó ${applied} sugerencias con confianza >= ${payload.minimumConfidence.toFixed(2)}. No se regeneró media.`
          );
          break;
        case 'set-voice':
          setCharacterVoice(current, payload.characterId, {
            provider: payload.provider,
            voiceId: payload.voiceId,
            stability: payload.stability,
            similarity: payload.similarity,
            style: payload.style,
            speed: payload.speed
          });
          break;
      }
      return current;
    });

    return NextResponse.json({
      ok: true,
      applied,
      project,
      casting: buildCastingState(project)
    });
  } catch (error) {
    return failure(error, 400);
  }
}

function failure(error: unknown, status: number) {
  return NextResponse.json({ ok: false, error: safeErrorMessage(error) }, { status });
}
