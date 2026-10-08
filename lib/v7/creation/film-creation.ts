import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { FilmV7Schema, type FilmV7 } from '@/lib/v7/domain/film';
import { createInitialV7Workflow } from '@/lib/v7/domain/workflow';

export const V7QualityPresetSchema = z.enum(['cine', 'premium', 'maxima']);

export const V7FilmCreationInputSchema = z.object({
  title: z.string().trim().min(3, 'El título debe tener al menos 3 caracteres.').max(240),
  story: z.string().trim().min(20, 'La historia debe tener al menos 20 caracteres.').max(20000),
  durationMinutes: z.number().min(1).max(180),
  genre: z.string().trim().min(2).max(160),
  aspectRatio: z.enum(['16:9', '2.39:1', '9:16', '1:1', '4:3']).default('16:9'),
  language: z.enum(['es', 'en']).default('es'),
  budgetUsd: z.number().nonnegative().max(1000000000).default(0),
  quality: V7QualityPresetSchema.default('cine')
});

export type V7FilmCreationInput = z.infer<typeof V7FilmCreationInputSchema>;
export type V7QualityPreset = z.infer<typeof V7QualityPresetSchema>;

export type V7CreationPreflight = {
  passed: boolean;
  errors: string[];
  warnings: string[];
  normalized: V7FilmCreationInput;
  externalApisRequired: false;
  estimatedApiCostUsd: 0;
};

export function preflightV7FilmCreation(input: unknown): V7CreationPreflight {
  const parsed = V7FilmCreationInputSchema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) =>
      issue.path.length ? issue.path.join('.') + ': ' + issue.message : issue.message
    );
    return {
      passed: false,
      errors,
      warnings: [],
      normalized: {
        title: '',
        story: '',
        durationMinutes: 90,
        genre: 'Drama',
        aspectRatio: '16:9',
        language: 'es',
        budgetUsd: 0,
        quality: 'cine'
      },
      externalApisRequired: false,
      estimatedApiCostUsd: 0
    };
  }

  const warnings: string[] = [];
  if (parsed.data.budgetUsd === 0) {
    warnings.push('Presupuesto US$0: el proyecto puede desarrollarse, pero la producción pagada permanecerá bloqueada.');
  }
  if (parsed.data.durationMinutes >= 60) {
    warnings.push('Largometraje: Story, Casting, Voice DNA, Continuity y Preflight deberán aprobarse antes de producir.');
  }

  return {
    passed: true,
    errors: [],
    warnings,
    normalized: parsed.data,
    externalApisRequired: false,
    estimatedApiCostUsd: 0
  };
}

export function createV7FilmDraft(
  input: V7FilmCreationInput,
  now = new Date().toISOString(),
  id = randomUUID()
) {
  const parsed = V7FilmCreationInputSchema.parse(input);
  const film: FilmV7 = FilmV7Schema.parse({
    id,
    title: parsed.title,
    premise: parsed.story,
    durationMinutes: parsed.durationMinutes,
    genre: parsed.genre,
    audience: '',
    visualStyle: qualityVisualStyle(parsed.quality),
    language: parsed.language,
    aspectRatio: parsed.aspectRatio,
    budgetUsd: parsed.budgetUsd,
    acts: [{
      id: id + '-act-development',
      filmId: id,
      order: 1,
      title: 'Estructura pendiente',
      dramaticObjective: 'Se definirá durante el endurecimiento de Story / Script.',
      sequences: []
    }],
    characters: [],
    createdAt: now,
    updatedAt: now,
    metadata: {
      productVersion: '7',
      qualityPreset: parsed.quality,
      creationMode: 'one-click-draft',
      productionLockedUntilPreflight: true,
      externalApisUsedDuringCreation: false
    }
  });

  return {
    film,
    creationInput: parsed,
    workflow: createInitialV7Workflow(now)
  };
}

function qualityVisualStyle(quality: V7QualityPreset) {
  if (quality === 'maxima') return 'Máxima: identidad, continuidad y acabado cinematográfico con umbrales estrictos.';
  if (quality === 'premium') return 'Premium: calidad cinematográfica elevada con QA reforzado.';
  return 'Cine: calidad cinematográfica equilibrada con control de continuidad.';
}
