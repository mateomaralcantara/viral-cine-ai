/**
 * Tomas FIJADAS: una vez que el autor da una toma por buena, ningún agente la vuelve a tocar
 * (ni Pulir, ni el Reparador, ni los fotogramas, ni cambios de texto).
 */
import { access, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

export const lockPath = (dir: string) => path.join(dir, 'fijada.json');

export async function isLocked(dir: string) {
  return access(lockPath(dir)).then(() => true, () => false);
}

export async function lockShot(dir: string, reason: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(lockPath(dir), JSON.stringify({ fijada: true, motivo: reason, fecha: new Date().toISOString() }, null, 2) + '\n');
}

export async function unlockShot(dir: string) {
  await rm(lockPath(dir), { force: true });
}

/** Tomas QUITADAS del montaje por el autor (el video original se conserva; se puede devolver). */
export const removedPath = (dir: string) => path.join(dir, 'quitada.json');

export async function isRemoved(dir: string) {
  return access(removedPath(dir)).then(() => true, () => false);
}

export async function removeShot(dir: string, reason: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(removedPath(dir), JSON.stringify({ quitada: true, motivo: reason, fecha: new Date().toISOString() }, null, 2) + '\n');
  await lockShot(dir, 'quitada del montaje por el autor');
}

export async function restoreShot(dir: string) {
  await rm(removedPath(dir), { force: true });
}
