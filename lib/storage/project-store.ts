import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FilmProjectSchema, type FilmProject, type ProjectInput } from '@/lib/domain/schemas';

const PROJECT_FILE = 'project.json';
const ACTIVE_PROJECT_STATUSES = new Set<FilmProject['status']>(['planning', 'queued', 'producing', 'composing']);

export class ProjectDeletionBlockedError extends Error {
  constructor(public readonly projectStatus: FilmProject['status']) {
    super('No se puede eliminar un proyecto mientras está en cola o en producción. Espera a que termine o cancélalo primero.');
    this.name = 'ProjectDeletionBlockedError';
  }
}

export function dataRoot() {
  const configured = process.env.VIRALCINE_DATA_DIR || '.data';
  return path.resolve(process.cwd(), configured);
}

export function projectRoot(projectId: string) {
  assertProjectId(projectId);
  return path.join(dataRoot(), 'projects', projectId);
}

export type ProjectAssetKind = 'images' | 'audio' | 'video' | 'exports' | 'uploads' | 'checkpoints' | 'quality';

export function projectAssetDir(projectId: string, kind: ProjectAssetKind) {
  return path.join(projectRoot(projectId), kind);
}

export function assetAbsolutePath(projectId: string, relativeAsset: string) {
  const root = projectRoot(projectId);
  const resolved = path.resolve(root, relativeAsset);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('Ruta de recurso inválida');
  return resolved;
}

export function assetRelativePath(projectId: string, absolutePath: string) {
  return path.relative(projectRoot(projectId), absolutePath).split(path.sep).join('/');
}

export async function ensureProjectFolders(projectId: string) {
  await Promise.all(
    (['images', 'audio', 'video', 'exports', 'uploads', 'checkpoints', 'quality'] as const).map((kind) =>
      mkdir(projectAssetDir(projectId, kind), { recursive: true })
    )
  );
}

export async function createProject(input: ProjectInput): Promise<FilmProject> {
  const now = new Date().toISOString();
  const project: FilmProject = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    input,
    progress: { phase: 'draft', percent: 0, message: 'Proyecto creado', updatedAt: now },
    productionLog: [`${now} Proyecto creado`]
  };
  await ensureProjectFolders(project.id);
  await saveProject(project);
  return project;
}

export async function listProjects(): Promise<FilmProject[]> {
  const directory = path.join(dataRoot(), 'projects');
  await mkdir(directory, { recursive: true });
  const entries = await readdir(directory, { withFileTypes: true });
  const projects = await Promise.all(
    entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      try {
        return await getProject(entry.name);
      } catch {
        return null;
      }
    })
  );
  return projects
    .filter((project): project is FilmProject => Boolean(project))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(projectId: string): Promise<FilmProject> {
  const raw = await readFile(path.join(projectRoot(projectId), PROJECT_FILE), 'utf8');
  return FilmProjectSchema.parse(JSON.parse(raw));
}

export async function deleteProject(projectId: string) {
  const project = await getProject(projectId);
  if (ACTIVE_PROJECT_STATUSES.has(project.status)) {
    throw new ProjectDeletionBlockedError(project.status);
  }

  const deletedAt = new Date().toISOString();
  const trashRoot = path.join(dataRoot(), 'trash', 'projects');
  const trashName = `${project.id}-${deletedAt.replace(/[:.]/g, '-')}`;
  await mkdir(trashRoot, { recursive: true });
  await rename(projectRoot(project.id), path.join(trashRoot, trashName));

  return {
    id: project.id,
    title: project.input.title,
    deletedAt,
    recoverable: true
  };
}

export async function saveProject(project: FilmProject): Promise<FilmProject> {
  const next = FilmProjectSchema.parse({ ...project, updatedAt: new Date().toISOString() });
  await ensureProjectFolders(next.id);
  const target = path.join(projectRoot(next.id), PROJECT_FILE);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
  return next;
}

export async function updateProject(
  projectId: string,
  updater: (project: FilmProject) => FilmProject | Promise<FilmProject>
) {
  const current = await getProject(projectId);
  return saveProject(await updater(current));
}

export async function appendLog(projectId: string, message: string) {
  return updateProject(projectId, (project) => ({
    ...project,
    productionLog: [...project.productionLog.slice(-299), `${new Date().toISOString()} ${message}`]
  }));
}

function assertProjectId(projectId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error('Identificador de proyecto inválido');
}
