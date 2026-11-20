/**
 * Qué video usa cada toma en el montaje: la versión reparada (gratis, FFmpeg) si
 * existe y corresponde al video original actual; si no, el original de Runway/Veo.
 * Si la toma se rehízo en el estudio, la reparación antigua deja de valer sola.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const exists = (f: string) => access(f).then(() => true, () => false);

export async function fileSha256(file: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export async function originalShotVideo(dir: string, label: string) {
  for (const f of [label + '-runway-gen4-turbo.mp4', label + '-veo-candidato.mp4']) {
    if (await exists(path.join(dir, f))) return path.join(dir, f);
  }
  return null;
}

export const repairedVideoPath = (dir: string, label: string) => path.join(dir, label + '-reparada.mp4');
export const repairRecordPath = (dir: string, label: string) => path.join(dir, 'reparacion', label + '-reparada.json');

export const trimmedVideoPath = (dir: string, label: string) => path.join(dir, label + '-recortada.mp4');
export const trimmedRecordPath = (dir: string, label: string) => path.join(dir, label + '-recortada.json');

export async function currentShotVideo(dir: string, label: string, opts: { dialogue?: boolean } = {}): Promise<{ file: string; repaired: boolean } | null> {
  const original = await originalShotVideo(dir, label);
  if (!original) return null;
  // Recorte hecho por el autor (se quitó un trozo que no se entendía): misma voz y labios sincronizados.
  const trimmed = trimmedVideoPath(dir, label);
  if (await exists(trimmed)) {
    try {
      const rec = JSON.parse(await readFile(trimmedRecordPath(dir, label), 'utf8')) as { originalSha256?: string };
      if (rec.originalSha256 && rec.originalSha256 === await fileSha256(original)) return { file: trimmed, repaired: true };
    } catch { /* sin registro válido */ }
  }
  const repaired = repairedVideoPath(dir, label);
  if (await exists(repaired)) {
    try {
      const rec = JSON.parse(await readFile(repairRecordPath(dir, label), 'utf8')) as { originalSha256?: string; plan?: { window?: unknown; speed?: number } };
      // Un diálogo nunca usa una reparación que recortó o ralentizó el video: la frase quedaría incompleta.
      const cutsDialogue = opts.dialogue && (rec.plan?.window != null || (rec.plan?.speed ?? 1) < 1);
      if (!cutsDialogue && rec.originalSha256 && rec.originalSha256 === await fileSha256(original)) return { file: repaired, repaired: true };
    } catch { /* sin registro válido: se usa el original */ }
  }
  return { file: original, repaired: false };
}
