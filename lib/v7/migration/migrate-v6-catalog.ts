import type { FilmProject } from '@/lib/domain/schemas';
import { listProjects } from '@/lib/storage/project-store';
import { createV7FilmDraft } from '@/lib/v7/creation/film-creation';
import { adaptLegacyProjectToV7 } from '@/lib/v7/compat/legacy-project-adapter';
import { FilmV7Schema } from '@/lib/v7/domain/film';
import {
  createInitialV7Workflow,
  type V7FilmWorkflow
} from '@/lib/v7/domain/workflow';
import {
  saveV7FilmBundle,
  v7FilmBundleExists
} from '@/lib/v7/storage/film-store';

export type V6CatalogMigrationResult = {
  migrated: Array<{ projectId: string; filmId: string; title: string; mode: 'planned' | 'draft' }>;
  skipped: Array<{ projectId: string; filmId: string; title: string; reason: string }>;
  failed: Array<{ projectId: string; title: string; error: string }>;
};

export async function migrateV6CatalogToV7(): Promise<V6CatalogMigrationResult> {
  const projects = await listProjects();
  const result: V6CatalogMigrationResult = { migrated: [], skipped: [], failed: [] };

  for (const project of projects) {
    try {
      const bundle = project.plan
        ? migratePlannedProject(project)
        : migrateDraftProject(project);

      if (await v7FilmBundleExists(bundle.film.id)) {
        result.skipped.push({
          projectId: project.id,
          filmId: bundle.film.id,
          title: bundle.film.title,
          reason: 'Ya existe en V7; no se sobrescribe.'
        });
        continue;
      }

      await saveV7FilmBundle(bundle);
      result.migrated.push({
        projectId: project.id,
        filmId: bundle.film.id,
        title: bundle.film.title,
        mode: project.plan ? 'planned' : 'draft'
      });
    } catch (error) {
      result.failed.push({
        projectId: project.id,
        title: project.input.title,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return result;
}

function migratePlannedProject(project: FilmProject) {
  const adapted = adaptLegacyProjectToV7(project);
  return {
    ...adapted,
    workflow: workflowFromLegacy(project)
  };
}

function migrateDraftProject(project: FilmProject) {
  const draft = createV7FilmDraft({
    title: project.input.title,
    story: project.input.premise,
    durationMinutes: project.input.durationMinutes,
    genre: project.input.genre,
    aspectRatio: project.input.aspectRatio,
    language: project.input.language,
    budgetUsd: project.input.budgetUsd,
    quality: 'cine'
  }, project.createdAt, 'v7-draft-' + project.id);

  const film = FilmV7Schema.parse({
    ...draft.film,
    legacyProjectId: project.id,
    audience: project.input.audience,
    visualStyle: project.input.visualStyle || draft.film.visualStyle,
    updatedAt: project.updatedAt,
    metadata: {
      ...draft.film.metadata,
      source: 'viralcine-6-draft',
      originalV6Status: project.status
    }
  });

  return {
    film,
    assets: [],
    voiceProfiles: [],
    creationInput: draft.creationInput,
    workflow: draft.workflow
  };
}

function workflowFromLegacy(project: FilmProject): V7FilmWorkflow {
  const now = project.updatedAt;
  const workflow = createInitialV7Workflow(now);
  const complete = Boolean(project.finalVideoAsset);

  return {
    stages: workflow.stages.map((stage) => {
      if (complete) {
        return {
          ...stage,
          status: stage.id === 'music' && !project.musicAsset ? 'pending' as const : 'approved' as const,
          notes: ['Migrado desde ViralCine 6 completado.'],
          updatedAt: now
        };
      }

      if (stage.id === 'project' || stage.id === 'story') {
        return {
          ...stage,
          status: 'approved' as const,
          notes: ['Migrado desde plan V6 existente.'],
          updatedAt: now
        };
      }

      if (stage.id === 'casting' && project.plan?.characters.length) {
        return {
          ...stage,
          status: 'ready' as const,
          notes: ['Personajes V6 disponibles para endurecimiento V7.'],
          updatedAt: now
        };
      }

      return stage;
    })
  };
}
