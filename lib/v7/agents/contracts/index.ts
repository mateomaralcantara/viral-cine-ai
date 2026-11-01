import type { FilmV7 } from '@/lib/v7/domain/film';
import type { GenerationJob } from '@/lib/v7/domain/job';
import type { SceneStateSnapshot } from '@/lib/v7/domain/continuity';
import type { Timeline } from '@/lib/v7/domain/timeline';

export type AgentContext = {
  film: FilmV7;
  continuity?: SceneStateSnapshot;
  approvedAssetIds: string[];
  budgetRemainingUsd: number;
};

export interface PlanningAgent<TInput, TOutput> {
  readonly name: string;
  plan(input: TInput, context: AgentContext): Promise<TOutput>;
}

export interface MasterDirectorAgent extends PlanningAgent<FilmV7, { jobs: GenerationJob[] }> {}
export interface StoryAgent extends PlanningAgent<{ premise: string }, { beats: string[] }> {}
export interface ScriptAgent extends PlanningAgent<{ beats: string[] }, { scenes: unknown[] }> {}
export interface ContinuityAgent extends PlanningAgent<{ sceneId: string }, SceneStateSnapshot> {}
export interface CinematographyAgent extends PlanningAgent<{ sceneId: string }, { shotPlans: unknown[] }> {}
export interface ShotAgent extends PlanningAgent<{ shotId: string }, { generationIntent: unknown }> {}
export interface VoiceAgent extends PlanningAgent<{ characterId: string; text: string }, { voicePlan: unknown }> {}
export interface EditorAgent extends PlanningAgent<{ approvedTakeIds: string[] }, Timeline> {}
export interface QAAgent extends PlanningAgent<{ targetType: string; targetId: string }, { checks: string[] }> {}
export interface CostAgent extends PlanningAgent<{ jobs: GenerationJob[] }, { estimatedCostUsd: number }> {}

/**
 * Regla de seguridad V7:
 * Los agentes planifican. Nunca reciben secretos ni clientes de proveedores.
 * Solo servicios deterministas pueden ejecutar I/O externo.
 */
