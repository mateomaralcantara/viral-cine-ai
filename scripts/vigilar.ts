/**
 * FAMILIA DE AGENTES EN VIVO: vigila una escena mientras se genera y corrige cada toma en el acto.
 *
 *   npm run vigilar -- episodio1 --escena E03 --hasta 6
 *
 * Cada vez que llega una toma nueva (y no está fijada):
 *   1. Agente de Escucha + Agente de Corte (solo diálogos): si sobra algo que no se entiende y la
 *      frase del guion sigue completa, lo recorta (gratis, voz original) y la fija.
 *      Si FALTA parte de la frase, la manda a regenerar.
 *   2. Agente Revisor + Reparador + Pulir (imagen): revisa, repara gratis y, solo si hace falta y
 *      queda presupuesto (--hasta), regenera. Lo que queda bien se FIJA.
 * Nunca toca otra escena ni una toma fijada. Se para solo al terminar, tras 150 min (--minutos) o con Ctrl + C.
 */
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { readV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { readShotRecord, resumeWholeScene, sceneExposureUsd, sceneStudioBoard } from '../lib/v7/production/scene-veo-engine';
import { fileSha256, originalShotVideo } from '../lib/v7/production/shot-current-video';
import { isLocked } from '../lib/v7/production/shot-lock';
import { gateEnabled } from '../lib/v7/qa/quality-gate';

(process.env as Record<string, string>).NODE_ENV ??= 'development';
nextEnv.loadEnvConfig(process.cwd(), true);
const args = process.argv.slice(2);
const key = args.find((a) => FILM_KEYS[a]) ?? '';
const filmId = FILM_KEYS[key];
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const sceneLabel = option('--escena')?.toUpperCase() ?? '';
if (!filmId || !sceneLabel) { console.log('Uso: npm run vigilar -- episodio1 --escena E03 --hasta 6'); process.exit(1); }
const budget = Math.max(0, Number(option('--hasta') ?? 0) || 0);
const root = v7FilmRoot(filmId);
const stateFile = path.join(root, `vigilancia-${sceneLabel}.json`);
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
const stamp = () => new Date().toLocaleTimeString('es');

function agent(script: string, extra: string[]) {
  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', path.join('scripts', script), key, ...extra], { stdio: 'inherit', env: process.env });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function main() {
  const { film } = await readV7FilmBundle(filmId);
  const scene = indexedScenes(film).find((s) => s.label === sceneLabel);
  if (!scene) throw new Error('No existe la escena ' + sceneLabel);
  const startExposure = await sceneExposureUsd(filmId, sceneLabel);
  const seen = new Set<string>(JSON.parse(await readFile(stateFile, 'utf8').catch(() => '[]')) as string[]);
  console.log(`FAMILIA DE AGENTES vigilando ${sceneLabel} · ${scene.scene.title}`);
  console.log(budget ? `Puede regenerar hasta US$${budget.toFixed(2)} en total.` : 'Sin presupuesto de regeneración: corrige gratis y avisa de lo que haya que regenerar (usa --hasta).');
  let idleRounds = 0;
  const stuck = new Set<string>();
  const deadline = Date.now() + Math.max(10, Number(option('--minutos') ?? 150)) * 60000; // nunca más de 150 min por defecto (una escena larga a 1 toma por minuto + correcciones)
  for (let round = 0; round < 400 && Date.now() < deadline; round++) {
    let pendingInScene = 0;
    let worked = false;
    // Hace avanzar la cola de la escena (recoge videos terminados y envía la siguiente toma, 1 por minuto),
    // aunque la página del estudio esté cerrada. Las tomas que esperan turno cuentan como pendientes.
    await resumeWholeScene(filmId, sceneLabel).catch(() => undefined);
    const board = await sceneStudioBoard(filmId, sceneLabel).catch(() => null);
    const waiting = board?.shots.filter((x) => ['queued', 'reserved', 'submitted', 'processing', 'quota-rejected'].includes(x.status)).length ?? 0;
    if (waiting) pendingInScene += waiting;
    for (const { shot, label } of scene.shots) {
      const dir = path.join(root, label.toLowerCase());
      if (await isLocked(dir)) continue;
      const rec = await readShotRecord(filmId, label).catch(() => null);
      if (!rec) continue; // aún no enviada (o en cola del estudio)
      // Una toma «reservada» sin ID de Google desde hace más de 10 min nunca llegó a enviarse
      // (p. ej. disco lleno): no se espera por ella, se avisa.
      const stale = rec.status === 'reserved' && !rec.operationName && Date.now() - Date.parse(rec.updatedAt || rec.createdAt) > 10 * 60000;
      if (stale) { if (!stuck.has(label)) { stuck.add(label); console.log(`  ${label}: quedó RESERVADA sin enviarse (posible disco lleno). Revísala en el estudio con «Recuperar misma tarea».`); } continue; }
      if (['reserved', 'submitted', 'processing'].includes(rec.status)) continue; // ya contadas arriba
      if (rec.status !== 'review-required' && rec.status !== 'failed-no-video' && rec.status !== 'quota-rejected') continue;
      const video = await originalShotVideo(dir, label);
      const id = video ? `${label}:${(await fileSha256(video)).slice(0, 12)}` : `${label}:${rec.status}:${rec.revisionId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      await writeFile(stateFile, JSON.stringify([...seen], null, 2) + '\n');
      worked = true;
      const spent = (await sceneExposureUsd(filmId, sceneLabel)) - startExposure;
      const left = Math.max(0, budget - spent);
      console.log(`\n[${stamp()}] ${label} · ${shot.title} — la familia de agentes la revisa`);
      const dialogue = shot.metadata?.onCameraDialogue === true && rec.status === 'review-required';
      if (dialogue) {
        // 1. Escucha + Corte: lo que no se entiende fuera, con la voz original.
        const code = await agent('frase.ts', ['--quitar', label, '--aplicar', ...(gateEnabled(film) ? ['--sin-fijar'] : [])]);
        if (await isLocked(dir)) { console.log(`  ${label}: diálogo corregido y FIJADO.`); continue; }
        // Con la puerta de calidad, el diálogo recortado sigue al Revisor (paso 2) antes de fijarse.
        if (code === 3) {
          console.log(`  ${label}: falta parte de la frase → se regenera${left >= 0.6 ? '' : ' (sin presupuesto: hazlo con --hasta)'}.`);
          if (left >= 0.6) await agent('pulir.ts', ['--toma', label, '--dialogo', label, '--hasta', left.toFixed(2), '--rondas', '2']);
          continue;
        }
      }
      // 2. Revisor + Reparador + Pulir (imagen y bloqueos de Google).
      await agent('pulir.ts', ['--toma', label, '--hasta', left.toFixed(2), '--rondas', '3']);
    }
    const allLocked = (await Promise.all(scene.shots.map(({ label }) => isLocked(path.join(root, label.toLowerCase()))))).every(Boolean);
    if (allLocked) {
      console.log(`\n[${stamp()}] ${sceneLabel}: todas las tomas están bien y FIJADAS (escena en VERDE). Montando la escena completa (gratis)…`);
      await new Promise<void>((resolve) => {
        const child = spawn(process.execPath, ['--import', 'tsx', path.join('scripts', 'pelicula-final.ts'), 'montar', key, '--escena', sceneLabel], { stdio: 'inherit', env: process.env });
        child.on('exit', () => resolve());
      });
      console.log(`[${stamp()}] ${sceneLabel}: lista para ver en el estudio («Ver escena completa»). Fin.`);
      break;
    }
    idleRounds = worked || pendingInScene ? 0 : idleRounds + 1;
    if (idleRounds >= 8) { console.log(`\n[${stamp()}] ${sceneLabel}: no queda nada que los agentes puedan corregir solos. Revisa las tomas no fijadas en el estudio.`); break; }
    await sleep(Number(process.env.V7_VIGILAR_SEGUNDOS || 45));
  }
  const spent = (await sceneExposureUsd(filmId, sceneLabel)) - startExposure;
  console.log(`Gasto de la familia de agentes en ${sceneLabel}: ~US$${Math.max(0, spent).toFixed(2)}${budget ? ` de US$${budget.toFixed(2)}` : ''}.`);
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
