import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ProjectInputSchema } from '../lib/domain/schemas';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  ProjectDeletionBlockedError,
  saveProject
} from '../lib/storage/project-store';

const input = ProjectInputSchema.parse({
  title: 'Proyecto eliminable',
  premise: 'Una película de prueba que puede moverse de forma segura a la papelera recuperable.',
  durationMinutes: 5,
  genre: 'Prueba técnica',
  audience: 'Equipo interno',
  visualStyle: 'Cinematográfico limpio',
  budgetUsd: 50,
  generateMusic: false
});

test('elimina del panel y conserva el proyecto en la papelera', async () => {
  const previousDataDir = process.env.VIRALCINE_DATA_DIR;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'viralcine-delete-'));
  process.env.VIRALCINE_DATA_DIR = directory;
  try {
    const project = await createProject(input);
    const deleted = await deleteProject(project.id);

    assert.equal(deleted.id, project.id);
    assert.equal(deleted.recoverable, true);
    assert.equal((await listProjects()).length, 0);
    await assert.rejects(() => getProject(project.id));

    const trashEntries = await readdir(path.join(directory, 'trash', 'projects'));
    assert.equal(trashEntries.length, 1);
    assert.match(trashEntries[0], new RegExp(`^${project.id}-`));
  } finally {
    if (previousDataDir === undefined) delete process.env.VIRALCINE_DATA_DIR;
    else process.env.VIRALCINE_DATA_DIR = previousDataDir;
    await rm(directory, { recursive: true, force: true });
  }
});

test('impide eliminar una película que el worker está procesando', async () => {
  const previousDataDir = process.env.VIRALCINE_DATA_DIR;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'viralcine-delete-active-'));
  process.env.VIRALCINE_DATA_DIR = directory;
  try {
    let project = await createProject(input);
    project.status = 'queued';
    project = await saveProject(project);

    await assert.rejects(() => deleteProject(project.id), ProjectDeletionBlockedError);
    assert.equal((await getProject(project.id)).status, 'queued');
  } finally {
    if (previousDataDir === undefined) delete process.env.VIRALCINE_DATA_DIR;
    else process.env.VIRALCINE_DATA_DIR = previousDataDir;
    await rm(directory, { recursive: true, force: true });
  }
});
