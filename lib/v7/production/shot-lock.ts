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
