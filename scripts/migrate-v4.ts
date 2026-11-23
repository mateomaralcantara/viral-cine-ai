import { randomUUID } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dataRoot = path.resolve(process.cwd(), process.env.VIRALCINE_DATA_DIR || '.data');
const projectsRoot = path.join(dataRoot, 'projects');
const backupRoot = path.join(dataRoot, 'backups', `before-v4-${new Date().toISOString().replace(/[:.]/g, '-')}`);

await mkdir(projectsRoot, { recursive: true });
await mkdir(backupRoot, { recursive: true });

const entries = await readdir(projectsRoot, { withFileTypes: true });
let migrated = 0;
let ambiguous = 0;

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const projectDir = path.join(projectsRoot, entry.name);
  const projectFile = path.join(projectDir, 'project.json');
  try {
    await access(projectFile);
  } catch {
    continue;
  }

  const raw = JSON.parse(await readFile(projectFile, 'utf8')) as any;
  const backupDir = path.join(backupRoot, entry.name);
  await mkdir(backupDir, { recursive: true });
  await cp(projectFile, path.join(backupDir, 'project.json'));

  // Checkpoints are metadata only and cheap to preserve. Media files remain untouched in place.
  const checkpointsDir = path.join(projectDir, 'checkpoints');
  try {
    await access(checkpointsDir);
    await cp(checkpointsDir, path.join(backupDir, 'checkpoints'), { recursive: true });
  } catch {
    // A legacy project can legitimately have no checkpoint directory.
  }

  if (raw.plan?.characters) {
    for (const character of raw.plan.characters) {
      character.voiceProvider ||= 'elevenlabs';
    }
  }

  if (raw.plan?.scenes) {
    for (const scene of raw.plan.scenes) {
      scene.dialogueTurns ||= [];
      if (!Array.isArray(scene.shots)) continue;
      for (const shot of scene.shots) {
        shot.dialogueLines ||= [];
        shot.pipelineVersion ||= '3.3-legacy';
        const spokenText = typeof shot.spokenText === 'string' ? shot.spokenText.trim() : '';
        if (!spokenText || shot.speakerId) continue;

        const ids = Array.isArray(shot.characterIds) ? shot.characterIds.filter(Boolean) : [];
        if (ids.length === 1) {
          shot.speakerId = ids[0];
          shot.dialogueLines = [{
            id: randomUUID(),
            speakerId: ids[0],
            text: spokenText,
            startSeconds: 0
          }];
        } else {
          ambiguous += 1;
          shot.preflightIssues = Array.from(new Set([
            ...(Array.isArray(shot.preflightIssues) ? shot.preflightIssues : []),
            'Migración 4.0: hablante ambiguo. Asigna speakerId manualmente antes de producir este segmento.'
          ]));
          shot.promptLocked = false;
        }
      }
    }
  }

  raw.productionLog = Array.isArray(raw.productionLog) ? raw.productionLog : [];
  raw.productionLog.push(`${new Date().toISOString()} Metadatos migrados de ViralCine 3.3 a 4.0; media existente preservada sin regeneración.`);
  raw.updatedAt = new Date().toISOString();

  const temporary = `${projectFile}.v4-${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  await renameWithWindowsRetry(temporary, projectFile);
  migrated += 1;
  console.log(`[migrate-v4] OK ${entry.name}`);
}

console.log(`[migrate-v4] Proyectos migrados: ${migrated}`);
console.log(`[migrate-v4] Segmentos con hablante ambiguo: ${ambiguous}`);
console.log(`[migrate-v4] Backup: ${backupRoot}`);
console.log('[migrate-v4] No se regeneró ni sobrescribió ningún video, audio, imagen o export existente.');

async function renameWithWindowsRetry(source: string, target: string) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      await rename(source, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(code || '') || attempt === 6) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 75));
    }
  }
}
