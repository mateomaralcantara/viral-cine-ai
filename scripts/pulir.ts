/**
 * AGENTE PULIR: deja una escena (o la película) bien, toma por toma, en rondas.
 *
 *   npm run pulir -- episodio1 --escena E01             modo gratis: diagnostica, repara y corrige textos
 *   npm run pulir -- episodio1 --escena E01 --hasta 6   además puede regenerar con Veo hasta US$6 en total
 *       --rondas 3      rondas máximas (por defecto 3)
 *
 * En cada ronda, para cada toma:
 *   1. Recupera las que siguen en proceso (gratis).
 *   2. BLOQUEADA por el filtro de Google (no cobra): el médico de textos entiende el motivo y la
 *      reformula (al 3.er intento, además, sin foto de referencia). Se reenvía: si vuelve a
 *      bloquearse, no cuesta nada; solo cuesta si sale el video.
 *   3. Con video: el Agente Revisor la evalúa (céntimos) y el Agente Reparador la arregla gratis
 *      con FFmpeg, comprobando que mejora.
 *   4. Si aún no está bien y el defecto solo se arregla regenerando (cara, movimiento…), el médico
 *      reescribe el texto y —solo con --hasta— se regenera. Luego vuelve al paso 1.
 * PLAN B: si una toma con diálogo en cámara falla 2 veces pagadas (o 3 bloqueos), la frase pasa a voz en off
 * (ElevenLabs) y la toma se regenera sin hablar en cámara. Otras tomas: máximo 3 versiones pagadas.
 * Nunca reintenta un resultado incierto (failed-unknown) y nunca pasa del tope que le das.
 */
import { spawn } from 'node:child_process';
import { access, mkdir, readdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { readV7FilmBundle, saveV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import {
  authorizationPhrase, estimateShotUsd, FILTERED_PATTERN, latestPromptRevision, readShotRecord, redoAuthorizationPhrase,
  resumeSceneShot, savePromptRevision, shotReferencePath, submitSceneShot, veoSceneRate
} from '../lib/v7/production/scene-veo-engine';
import { fileSha256, originalShotVideo, repairRecordPath } from '../lib/v7/production/shot-current-video';
import { rewritePrompt } from '../lib/v7/qa/prompt-doctor';
import type { ShotReview } from '../lib/v7/qa/shot-vision-review';

// El motor solo genera en el estudio local (desarrollo): este agente es local.
(process.env as Record<string, string>).NODE_ENV ??= 'development';
nextEnv.loadEnvConfig(process.cwd(), true);

const args = process.argv.slice(2);
const key = args.find((a) => FILM_KEYS[a]) ?? '';
const filmId = FILM_KEYS[key];
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
if (!filmId) { console.log('Uso: npm run pulir -- ' + Object.keys(FILM_KEYS).join('|') + ' [--escena E01] [--hasta 6] [--rondas 3]'); process.exit(1); }
const onlyScene = option('--escena')?.toUpperCase();
const budget = Math.max(0, Number(option('--hasta') ?? 0) || 0);
const rounds = Math.max(1, Math.min(5, Number(option('--rondas') ?? 3) || 3));
const root = v7FilmRoot(filmId);
const exists = (f: string) => access(f).then(() => true, () => false);
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
let spent = 0;

type Row = { label: string; state: string; note: string };
const log = new Map<string, Row>();
const note = (label: string, state: string, text: string) => { log.set(label, { label, state, note: text }); console.log(`  ${label}  ${state}  ${text}`); };

function runScript(script: string, extra: string[]) {
  return new Promise<void>((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', path.join('scripts', script), key, ...extra], { stdio: 'inherit', env: process.env });
    child.on('exit', () => resolve());
  });
}

async function reportFor(label: string): Promise<(ShotReview & { videoSha256: string }) | null> {
  const dir = path.join(root, label.toLowerCase());
  const video = await originalShotVideo(dir, label);
  if (!video) return null;
  const sha = await fileSha256(video);
  try { return JSON.parse(await readFile(path.join(dir, 'calidad', `${label}-${sha.slice(0, 12)}.json`), 'utf8')); } catch { return null; }
}

/** Bien = aprobada por el revisor, o una reparación aceptada que la dejó aprobada. */
async function isGood(label: string) {
  const r = await reportFor(label);
  if (!r) return null;
  if (r.veredicto === 'aprobar' || (r.veredicto === 'revisar' && r.puntuacion >= 7)) return true;
  const dir = path.join(root, label.toLowerCase());
  try {
    const rep = JSON.parse(await readFile(repairRecordPath(dir, label), 'utf8')) as { originalSha256: string; after?: { veredicto?: string; puntuacion?: number } | null };
    if (rep.originalSha256 === r.videoSha256 && (rep.after?.veredicto === 'aprobar' || (rep.after?.puntuacion ?? 0) >= 7)) return true;
  } catch { /* sin reparación */ }
  return false;
}

async function blockedAttempts(label: string) {
  try {
    const dir = path.join(root, label.toLowerCase(), 'veo-attempts');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
    let n = 0;
    for (const f of files) { const r = JSON.parse(await readFile(path.join(dir, f), 'utf8')); if (r.status === 'failed-no-video') n++; }
    return n;
  } catch { return 0; }
}

/** Versiones de pago ya generadas (con video) de una toma, archivadas al rehacer. */
async function paidVersions(label: string) {
  let n = 0;
  try {
    const dir = path.join(root, label.toLowerCase(), 'veo-attempts');
    for (const f of (await readdir(dir)).filter((x) => x.endsWith('.json'))) {
      const r = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
      if (r.status === 'review-required') n++;
    }
  } catch { /* sin intentos archivados */ }
  return n;
}

/** Plan B: el diálogo deja de decirse en cámara y pasa a voz en off (ElevenLabs, voz estable). */
async function toVoiceOver(label: string) {
  const stored = await readV7FilmBundle(filmId);
  for (const scene of indexedScenes(stored.film)) for (const { shot, label: l } of scene.shots) {
    if (l !== label) continue;
    shot.metadata = { ...shot.metadata, onCameraDialogue: false, voiceOver: true, lipsyncStatus: 'not-needed', planB: 'voz-en-off' };
  }
  await saveV7FilmBundle({ ...stored, savedAt: undefined });
}

async function dropReference(label: string) {
  const ref = shotReferencePath(filmId, label);
  if (!(await exists(ref))) return false;
  const dir = path.join(path.dirname(ref), 'archivo');
  await mkdir(dir, { recursive: true });
  await rename(ref, path.join(dir, `${label}-referencia-${Date.now()}.jpg`));
  return true;
}

async function main() {
  const { film } = await readV7FilmBundle(filmId);
  const rate = veoSceneRate();
  const scenes = indexedScenes(film).filter((s) => !onlyScene || s.label === onlyScene);
  if (!scenes.length) throw new Error('No encuentro la escena ' + onlyScene);
  console.log(`AGENTE PULIR — ${film.title}${onlyScene ? ' · ' + onlyScene : ''}`);
  console.log(budget ? `Puede regenerar con Veo hasta US$${budget.toFixed(2)} (los bloqueos no cuestan).` : 'Modo gratis: diagnostica, repara y corrige textos; no regenera video (usa --hasta para permitirlo).');

  for (let round = 1; round <= rounds; round++) {
    console.log(`\n=== RONDA ${round} de ${rounds} ===`);
    const pending: string[] = [];
    // 1-2: en proceso, bloqueadas y cuota
    for (const scene of scenes) for (const { shot, label } of scene.shots) {
      let rec = await readShotRecord(filmId, label).catch((e: Error) => { note(label, 'ERROR', e.message); return null; });
      if (!rec) continue;
      if (rec.status === 'submitted' || rec.status === 'processing') {
        try { await resumeSceneShot(filmId, label); } catch { /* se reintenta la próxima ronda */ }
        rec = await readShotRecord(filmId, label);
        if (rec && (rec.status === 'submitted' || rec.status === 'processing')) { pending.push(label); continue; }
      }
      if (!rec) continue;
      if (rec.status === 'failed-unknown') { note(label, 'INCIERTA', 'resultado dudoso: no se reintenta (revisa en el estudio con «Recuperar»)'); continue; }
      const blocked = rec.status === 'failed-no-video';
      if (!blocked && rec.status !== 'quota-rejected') continue;
      let onCamera = shot.metadata?.onCameraDialogue === true;
      const revision = await latestPromptRevision(filmId, label).catch(() => null);
      const current = revision?.promptText ?? shot.visualPrompt;
      let revisionId = revision?.revisionId ?? '';
      if (blocked) {
        const attempt = (await blockedAttempts(label)) + 1;
        let extra = '';
        if (onCamera && attempt >= 4) { await toVoiceOver(label); onCamera = false; extra += ' · PLAN B: la frase pasa a voz en off'; }
        if (attempt >= 3 && await dropReference(label)) extra = ' · sin foto de referencia';
        try {
          const fixed = await rewritePrompt({ prompt: current, kind: 'bloqueada', problem: rec.error ?? 'bloqueada', line: shot.spokenText ?? '', onCamera, attempt });
          revisionId = (await savePromptRevision(filmId, label, fixed)).revisionId;
          note(label, 'BLOQUEADA', `texto reformulado (intento ${attempt}${extra}) · Google no cobró el bloqueo`);
        } catch (e) { note(label, 'BLOQUEADA', (e as Error).message); continue; }
      }
      const est = rate ? estimateShotUsd(shot.durationSeconds, rate) : 0;
      if (!budget || spent + est > budget + 1e-9) {
        note(label, blocked ? 'LISTA' : 'CUOTA', `texto listo; para generarla: --hasta (o en el estudio, frase «${authorizationPhrase(label, est)}»)`);
        continue;
      }
      try {
        await submitSceneShot(filmId, label, { revisionId, authorization: authorizationPhrase(label, est) });
        spent += est; pending.push(label);
        note(label, 'ENVIADA', `a Veo (US$${est.toFixed(2)} si sale el video)`);
      } catch (e) { const m = (e as Error).message; note(label, /Tope de la escena/.test(m) ? 'TOPE' : 'ERROR', m.slice(0, 160)); }
    }

    // espera a que terminen (gratis)
    for (let t = 0; pending.length && t < 40; t++) {
      await sleep(20);
      for (const label of [...pending]) {
        try { await resumeSceneShot(filmId, label); } catch { /* sigue */ }
        const rec = await readShotRecord(filmId, label);
        if (!rec || rec.status === 'submitted' || rec.status === 'processing') continue;
        pending.splice(pending.indexOf(label), 1);
        if (rec.status === 'failed-no-video' && FILTERED_PATTERN.test(rec.error ?? '')) {
          const shot = scenes.flatMap((s) => s.shots).find((x) => x.label === label)!.shot;
          spent -= rate ? estimateShotUsd(shot.durationSeconds, rate) : 0; // bloqueada: no cobra
        }
        console.log(`  ${label}: ${rec.status}`);
      }
    }

    // 3: revisar y reparar gratis
    const sceneArgs = onlyScene ? ['--escena', onlyScene] : [];
    await runScript('calidad-tomas.ts', ['--revisar', ...sceneArgs]);
    for (const scene of scenes) for (const { label } of scene.shots) {
      if ((await isGood(label)) === false) await runScript('reparar-tomas.ts', ['--reparar', '--toma', label]);
    }

    // 4: lo que solo se arregla regenerando
    let open = 0;
    for (const scene of scenes) for (const { shot, label } of scene.shots) {
      const good = await isGood(label);
      if (good === null) continue;
      if (good) { note(label, 'BIEN', 'aprobada'); continue; }
      open++;
      const r = (await reportFor(label))!;
      const rec = await readShotRecord(filmId, label).catch(() => null);
      if (!rec || rec.status !== 'review-required') continue;
      let onCamera = shot.metadata?.onCameraDialogue === true;
      const versions = await paidVersions(label) + 1;
      let planB = '';
      if (versions >= 3) {
        if (onCamera) { await toVoiceOver(label); onCamera = false; planB = ' · PLAN B: la frase pasa a voz en off'; }
        else if (versions >= 4) { note(label, 'AGOTADA', `${r.puntuacion}/10 · ${versions - 1} versiones pagadas sin mejorar: se queda la actual (reparada si se pudo)`); continue; }
      }
      const revision = await latestPromptRevision(filmId, label).catch(() => null);
      const problems = r.problemas.map((p) => `${p.tipo}: ${p.descripcion}`).join('; ') || r.motivo;
      try {
        const fixed = await rewritePrompt({ prompt: revision?.promptText ?? shot.visualPrompt, kind: 'calidad', problem: problems, line: shot.spokenText ?? '', onCamera, attempt: round });
        const rev = await savePromptRevision(filmId, label, fixed);
        const est = rate ? estimateShotUsd(shot.durationSeconds, rate) : 0;
        if (!budget || spent + est > budget + 1e-9) { note(label, 'MEJORABLE', `${r.puntuacion}/10 · texto corregido guardado; para regenerarla: --hasta`); continue; }
        await submitSceneShot(filmId, label, { revisionId: rev.revisionId, authorization: redoAuthorizationPhrase(label, est), redo: true });
        spent += est;
        note(label, 'REGENERANDO', `${r.puntuacion}/10 → nueva versión enviada (US$${est.toFixed(2)})${planB}`);
      } catch (e) { const m = (e as Error).message; note(label, /Tope de la escena/.test(m) ? 'TOPE' : 'MEJORABLE', m.slice(0, 160)); }
    }
    const waiting = [...log.values()].some((r) => ['ENVIADA', 'REGENERANDO'].includes(r.state));
    const unresolved = [...log.values()].filter((r) => r.state !== 'BIEN').length;
    if (!open && !waiting && !unresolved) { console.log('\nTodo está bien. Fin.'); break; }
    if (!waiting && !budget) { console.log('\nModo gratis: lo pendiente necesita generar video (usa --hasta o el estudio). Fin.'); break; }
  }

  console.log('\n=== RESUMEN ===');
  for (const r of [...log.values()].sort((a, b) => a.label.localeCompare(b.label))) console.log(`  ${r.label.padEnd(8)} ${r.state.padEnd(12)} ${r.note}`);
  console.log(`  Gasto en video de este agente: ~US$${Math.max(0, spent).toFixed(2)}${budget ? ` de US$${budget.toFixed(2)}` : ''}. Siguiente: npm run montar -- ${key}`);
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
