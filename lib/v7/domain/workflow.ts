import { z } from 'zod';
import { TimestampSchema } from './common';

export const V7WorkflowStageIdSchema = z.enum([
  'project',
  'story',
  'casting',
  'voices',
  'music',
  'continuity',
  'production',
  'qa',
  'post',
  'master'
]);

export const V7WorkflowStageStatusSchema = z.enum([
  'pending',
  'ready',
  'in-progress',
  'blocked',
  'approved'
]);

export const V7WorkflowStageSchema = z.object({
  id: V7WorkflowStageIdSchema,
  label: z.string().trim().min(1).max(120),
  status: V7WorkflowStageStatusSchema,
  notes: z.array(z.string().max(1000)).max(100).default([]),
  updatedAt: TimestampSchema
});

export const V7FilmWorkflowSchema = z.object({
  stages: z.array(V7WorkflowStageSchema).length(10)
});

export type V7WorkflowStageId = z.infer<typeof V7WorkflowStageIdSchema>;
export type V7WorkflowStageStatus = z.infer<typeof V7WorkflowStageStatusSchema>;
export type V7WorkflowStage = z.infer<typeof V7WorkflowStageSchema>;
export type V7FilmWorkflow = z.infer<typeof V7FilmWorkflowSchema>;

export function createInitialV7Workflow(now = new Date().toISOString()): V7FilmWorkflow {
  const entries: Array<[V7WorkflowStageId, string, V7WorkflowStageStatus]> = [
    ['project', 'Proyecto', 'approved'],
    ['story', 'Historia y guion', 'ready'],
    ['casting', 'Selección de personajes', 'pending'],
    ['voices', 'Voces / Voice DNA', 'pending'],
    ['music', 'Banda sonora', 'pending'],
    ['continuity', 'Continuidad', 'pending'],
    ['production', 'Producción de video', 'pending'],
    ['qa', 'QA y reparación', 'pending'],
    ['post', 'Postproducción', 'pending'],
    ['master', 'Master final', 'pending']
  ];
  return {
    stages: entries.map(([id, label, status]) => ({
      id,
      label,
      status,
      notes: [],
      updatedAt: now
    }))
  };
}
