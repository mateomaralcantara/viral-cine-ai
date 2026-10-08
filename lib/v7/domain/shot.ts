import { z } from 'zod';
import { EntityIdSchema } from './common';
import { TakeSchema } from './take';

export const ShotSchema = z.object({
  id: EntityIdSchema,
  sceneId: EntityIdSchema,
  order: z.number().int().positive(),
  title: z.string().trim().min(1).max(240),
  intention: z.string().max(6000).default(''),
  durationSeconds: z.number().positive().max(120),
  visualPrompt: z.string().max(12000).default(''),
  camera: z.string().max(4000).default(''),
  spokenText: z.string().max(12000).default(''),
  speakerId: EntityIdSchema.optional(),
  characterIds: z.array(EntityIdSchema).max(20).default([]),
  characterStateIds: z.record(EntityIdSchema).default({}),
  strategy: z.string().trim().min(1).max(160).default('generic-cinematic'),
  selectedTakeId: EntityIdSchema.optional(),
  takes: z.array(TakeSchema).max(100).default([]),
  metadata: z.record(z.unknown()).default({})
}).superRefine((shot, ctx) => {
  if (!shot.selectedTakeId) return;
  const selected = shot.takes.find((take) => take.id === shot.selectedTakeId);
  if (!selected) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['selectedTakeId'],
      message: 'selectedTakeId debe referenciar un Take existente.'
    });
    return;
  }
  if (!['approved', 'succeeded'].includes(selected.status)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['selectedTakeId'],
      message: 'El Take seleccionado debe estar aprobado o completado.'
    });
  }
});

export type Shot = z.infer<typeof ShotSchema>;
