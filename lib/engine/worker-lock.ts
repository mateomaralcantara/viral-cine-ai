import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { dataRoot } from '@/lib/storage/project-store';

type LockRecord = {
  token: string;
  pid: number;
  startedAt: string;
};

export async function acquireWorkerLock() {
  const lockPath = path.join(dataRoot(), 'worker.lock');
  await mkdir(path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const record: LockRecord = { token: randomUUID(), pid: process.pid, startedAt: new Date().toISOString() };
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, 'utf8');
      await handle.close();
      return {
        path: lockPath,
        release: async () => {
          try {
            const current = JSON.parse(await readFile(lockPath, 'utf8')) as Partial<LockRecord>;
            if (current.token === record.token) await rm(lockPath, { force: true });
          } catch {
            // El bloqueo ya no existe o fue reemplazado; no se elimina nada ajeno.
          }
        }
      };
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      const existing = await readLock(lockPath);
      if (existing && processIsAlive(existing.pid)) {
        throw new Error(
          `Ya existe un worker de ViralCine activo (PID ${existing.pid}, iniciado ${existing.startedAt}). ` +
          'Detenlo antes de iniciar otro para evitar cobros duplicados.'
        );
      }
      await rm(lockPath, { force: true });
    }
  }
  throw new Error('No se pudo adquirir el bloqueo exclusivo del worker.');
}

async function readLock(lockPath: string) {
  try {
    const value = JSON.parse(await readFile(lockPath, 'utf8')) as Partial<LockRecord>;
    if (!value.pid || !value.startedAt || !value.token) return undefined;
    return value as LockRecord;
  } catch {
    return undefined;
  }
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isAlreadyExists(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST');
}
