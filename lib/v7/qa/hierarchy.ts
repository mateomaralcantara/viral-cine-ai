import { z } from 'zod';
import { EntityIdSchema } from '@/lib/v7/domain/common';

export const QALevelSchema = z.enum(['take', 'shot', 'scene', 'sequence', 'act', 'film']);
export const QACategorySchema = z.enum([
  'technical','identity','anatomy','motion','lip-sync',
  'audio','continuity','cinematography','narrative','safety'
]);

export const QAResultSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  level: QALevelSchema,
  targetId: EntityIdSchema,
  categoryScores: z.record(z.number().min(0).max(10)),
  overallScore: z.number().min(0).max(10),
  criticalFailures: z.array(z.string()).default([]),
  issues: z.array(z.string()).default([]),
  passed: z.boolean()
});

export type QAResult = z.infer<typeof QAResultSchema>;

export function aggregateQA(results: QAResult[], threshold = 8) {
  if (!results.length) return { passed: false, score: 0, criticalFailures: ['Sin resultados QA'] };
  const criticalFailures = results.flatMap((result) => result.criticalFailures);
  const score = Math.round(
    results.reduce((sum, result) => sum + result.overallScore, 0) / results.length * 100
  ) / 100;
  return {
    passed: criticalFailures.length === 0 &&
      results.every((result) => result.passed) &&
      score >= threshold,
    score,
    criticalFailures
  };
}
