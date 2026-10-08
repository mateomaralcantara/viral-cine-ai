import { z } from 'zod';
import { ActSchema } from './act';
import { CharacterV7Schema } from './character';
import { EntityIdSchema, TimestampSchema } from './common';

export const FilmV7Schema = z.object({
  id: EntityIdSchema,
  title: z.string().trim().min(1).max(240),
  premise: z.string().max(20000).default(''),
  durationMinutes: z.number().min(1).max(180),
  genre: z.string().trim().min(1).max(160).default('Drama'),
  audience: z.string().max(2000).default(''),
  visualStyle: z.string().max(4000).default(''),
  language: z.string().trim().min(1).max(40).default('es'),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3', '2.39:1']).default('16:9'),
  budgetUsd: z.number().nonnegative().max(1000000000).default(0),
  acts: z.array(ActSchema).min(1).max(5),
  characters: z.array(CharacterV7Schema).max(100).default([]),
  currentVersionId: EntityIdSchema.optional(),
  timelineId: EntityIdSchema.optional(),
  legacyProjectId: EntityIdSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  metadata: z.record(z.unknown()).default({})
}).superRefine((film, ctx) => {
  const scenes = film.acts.flatMap((act) => act.sequences.flatMap((sequence) => sequence.scenes));
  if (scenes.length > 200) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['acts'], message: 'ViralCine 7 admite hasta 200 escenas por película.' });
  }
  const shotCount = scenes.reduce((sum, scene) => sum + scene.shots.length, 0);
  if (shotCount > 2000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['acts'], message: 'ViralCine 7 admite hasta 2,000 shots por película.' });
  }
});
export type FilmV7 = z.infer<typeof FilmV7Schema>;
