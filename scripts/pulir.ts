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
 * Nunca cambia la voz de un diálogo. Tras 3 versiones pagadas sin mejorar, se detiene y avisa.
 *   --dialogo E01-P10,E01-P16   devuelve esas tomas a diálogo en cámara y las regenera (con --hasta)
 * Nunca reintenta un resultado incierto (failed-unknown) y nunca pasa del tope que le das.
 */
import { spawn } from 'node:child_process';
import { access, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { readV7FilmBundle, saveV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import {
  authorizationPhrase, estimateShotUsd, FILTERED_PATTERN, latestPromptRevision, readShotRecord, redoAuthorizationPhrase,
  resumeSceneShot, savePromptRevision, shotReferencePath, submitSceneShot, veoSceneRate
} from '../lib/v7/production/scene-veo-engine';
import { currentShotVideo, fileSha256, originalShotVideo, repairRecordPath } from '../lib/v7/production/shot-current-video';
import { gateEnabled, qualityGate, type GateResult } from '../lib/v7/qa/quality-gate';
import { approvedSheets, castInShot, continuityRequired } from '../lib/v7/production/continuity-chain';
import { serieOf } from '../lib/v7/production/character-identity';
import { rewritePrompt } from '../lib/v7/qa/prompt-doctor';
import { isLocked, lockShot } from '../lib/v7/production/shot-lock';
import { activeLessons, learnFromDefects, readCounts } from '../lib/v7/qa/lessons';
import type { ShotReview } from '../lib/v7/qa/shot-vision-review';

// El motor solo genera en el estudio local (desarrollo): este agente es local.
(process.env as Record<string, string>).NODE_ENV ??= 'development';
nextEnv.loadEnvConfig(process.cwd(), true);

const args = process.argv.slice(2);
const key = args.find((a) => FILM_KEYS[a]) ?? '';
const filmId = FILM_KEYS[key];
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
if (!filmId) { console.log('Uso: npm run pulir -- ' + Object.keys(FILM_KEYS).join('|') + ' [--escena E01] [--toma E01-P01] [--hasta 6] [--rondas 3] [--dialogo E01-P10,E01-P16]'); process.exit(1); }
const onlyScene = option('--escena')?.toUpperCase();
const budget = Math.max(0, Number(option('--hasta') ?? 0) || 0);
const rounds = Math.max(1, Math.min(5, Number(option('--rondas') ?? 3) || 3));
const restoreList = (option('--dialogo') ?? '').toUpperCase().split(',').map((x) => x.trim()).filter(Boolean);
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

/**
 * PUERTA DE CALIDAD: revisa el video que de verdad irá a la película (recortado o reparado),
 * escucha el diálogo y solo deja pasar la toma si no tiene NINGÚN error.
 */
type ShotEntry = { characterIds: string[]; visualPrompt?: string; metadata?: Record<string, unknown> };
async function gateFor(label: string, shot: ShotEntry, serie: string): Promise<GateResult | null> {
  const dir = path.join(root, label.toLowerCase());
  const onCamera = shot.metadata?.onCameraDialogue === true;
  const current = await currentShotVideo(dir, label, { dialogue: onCamera });
  const original = await originalShotVideo(dir, label);
  if (!current || !original) return null;
  const hash = await fileSha256(current.file);
  const reportFile = path.join(dir, 'calidad', `${label}-${hash.slice(0, 12)}.json`);
  if (!(await exists(reportFile))) await runScript('calidad-tomas.ts', ['--revisar', '--actual', '--toma', label]);
  const review = JSON.parse(await readFile(reportFile, 'utf8').catch(() => 'null')) as ShotReview | null;
  let listenCoverage: number | null = null;
  if (onCamera) {
    const originalSha = await fileSha256(original);
    const read = async () => { try { const e = JSON.parse(await readFile(path.join(dir, 'escucha.json'), 'utf8')) as { sha: string; coverage: number }; return e.sha === originalSha ? e.coverage : null; } catch { return null; } };
    listenCoverage = await read();
    if (listenCoverage == null) { await runScript('frase.ts', ['--quitar', label]); listenCoverage = await read(); }
  }
  const prompt = (await latestPromptRevision(filmId, label).catch(() => null))?.promptText ?? shot.visualPrompt ?? '';
  const showsCharacter = castInShot(shot, prompt, await approvedSheets(serie)).length > 0;
  const result = qualityGate({ review, onCamera, showsCharacter, listenCoverage });
  await writeFile(path.join(dir, 'puerta.json'), JSON.stringify({ label, video: path.basename(current.file), ...result, fecha: new Date().toISOString() }, null, 2) + '\n');
  return result;
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

/** Devuelve una toma a diálogo en cámara (deshace un plan B anterior de voz en off). */
async function toOnCamera(label: string) {
  const stored = await readV7FilmBundle(filmId);
  let prompt = '';
  for (const scene of indexedScenes(stored.film)) for (const { shot, label: l } of scene.shots) {
    if (l !== label) continue;
    const { planB: _drop, ...rest } = (shot.metadata ?? {}) as Record<string, unknown>;
    shot.metadata = { ...rest, onCameraDialogue: true, voiceOver: false, lipsyncStatus: 'native-veo' };
    prompt = shot.visualPrompt;
  }
  if (!prompt) throw new Error('No encuentro la toma ' + label);
  await saveV7FilmBundle({ ...stored, savedAt: undefined });
  return prompt;
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
  // PUERTA DE CALIDAD (activa salvo que la película la desactive): solo se fija lo que no tiene ningún error.
  const strict = gateEnabled(film);
  const serie = serieOf(film);
  if (strict) console.log('PUERTA DE CALIDAD activa: ninguna toma se fija si tiene un solo error.');
  // --toma E01-P01: el agente trabaja SOLO sobre esas tomas (no toca ninguna otra).
  const onlyShots = (option('--toma') ?? '').toUpperCase().split(',').map((x) => x.trim()).filter(Boolean);
  // Tomas fijadas por el autor: ningún agente las toca.
  const lockedSet = new Set<string>();
  for (const sc of indexedScenes(film)) for (const { label } of sc.shots) if (await isLocked(path.join(root, label.toLowerCase()))) lockedSet.add(label);
  if (lockedSet.size) console.log('Fijadas (no se tocan): ' + [...lockedSet].join(', '));
  const scenes = indexedScenes(film).filter((s) => !onlyScene || s.label === onlyScene)
    .map((s) => ({ ...s, shots: s.shots.filter((x) => !onlyShots.length || onlyShots.includes(x.label)) }))
    .map((s) => ({ ...s, shots: s.shots.filter((x) => !lockedSet.has(x.label)) }))
    .filter((s) => s.shots.length);
  if (!scenes.length) throw new Error('No encuentro la escena ' + onlyScene);
  console.log(`AGENTE PULIR — ${film.title}${onlyScene ? ' · ' + onlyScene : ''}`);
  console.log(budget ? `Puede regenerar con Veo hasta US$${budget.toFixed(2)} (los bloqueos no cuestan).` : 'Modo gratis: diagnostica, repara y corrige textos; no regenera video (usa --hasta para permitirlo).');

  // Diálogos que vuelven a decirse en cámara, con el texto original del guion + lecciones.
  const restored: string[] = [];
  for (const label of restoreList) {
    try {
      const prompt = await toOnCamera(label);
      const rev = await savePromptRevision(filmId, label, prompt);
      const shot = scenes.flatMap((x) => x.shots).find((x) => x.label === label)?.shot;
      const est = rate && shot ? estimateShotUsd(shot.durationSeconds, rate) : 0;
      if (!budget || spent + est > budget + 1e-9) { note(label, 'DIALOGO', 'vuelve a diálogo en cámara; para regenerarla: --hasta'); continue; }
      const rec = await readShotRecord(filmId, label).catch(() => null);
      const redo = rec?.status === 'review-required';
      await submitSceneShot(filmId, label, { revisionId: rev.revisionId, authorization: redo ? redoAuthorizationPhrase(label, est) : authorizationPhrase(label, est), redo });
      spent += est; restored.push(label);
      note(label, 'REGENERANDO', `vuelve a diálogo en cámara con su voz en la toma (US$${est.toFixed(2)})`);
    } catch (e) { note(label, 'ERROR', (e as Error).message.slice(0, 160)); }
  }

  for (let round = 1; round <= rounds; round++) {
    console.log(`\n=== RONDA ${round} de ${rounds} ===`);
    const pending: string[] = round === 1 ? [...restored] : [];
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
      const onCamera = shot.metadata?.onCameraDialogue === true;
      const revision = await latestPromptRevision(filmId, label).catch(() => null);
      const current = revision?.promptText ?? shot.visualPrompt;
      let revisionId = revision?.revisionId ?? '';
      if (blocked) {
        const attempt = (await blockedAttempts(label)) + 1;
        let extra = '';
        // La foto de partida también puede disparar el filtro. Con continuidad obligatoria no se quita:
        // se crea una foto de continuidad NUEVA (~US$0.04); sin ella, se prueba solo con texto.
        if (attempt >= 2 && continuityRequired(film)) { await runScript('continuidad.ts', ['--tomas', label, '--generar']); extra = ' · foto de continuidad nueva'; }
        else if (attempt >= 3 && await dropReference(label)) extra = ' · sin foto de referencia';
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
    const sceneArgs = onlyShots.length === 1 ? ['--toma', onlyShots[0]] : onlyScene ? ['--escena', onlyScene] : [];
    await runScript('calidad-tomas.ts', ['--revisar', ...sceneArgs]);
    for (const scene of scenes) for (const { label } of scene.shots) {
      if ((await isGood(label)) === false) await runScript('reparar-tomas.ts', ['--reparar', '--toma', label]);
    }

    // 4: lo que solo se arregla regenerando
    let open = 0;
    for (const scene of scenes) for (const { shot, label } of scene.shots) {
      const gate = strict ? await gateFor(label, shot, serie) : null;
      const good = strict ? (gate ? gate.pass : null) : await isGood(label);
      if (good === null) continue;
      { const rep = await reportFor(label); if (rep?.problemas.length) await learnFromDefects(rep.problemas.map((p) => `${p.tipo} ${p.descripcion}`), rep.videoSha256.slice(0, 16)); }
      if (good) { await lockShot(path.join(root, label.toLowerCase()), strict ? 'pasó la puerta de calidad (sin errores)' : 'aprobada por el revisor'); note(label, 'BIEN', strict ? 'PASÓ LA PUERTA (sin errores) · FIJADA' : 'aprobada · FIJADA (no se vuelve a tocar)'); continue; }
      if (gate) console.log(`  ${label}  NO PASA LA PUERTA:\n${gate.reasons.map((x) => '     · ' + x).join('\n')}`);
      open++;
      const r = (await reportFor(label))!;
      const rec = await readShotRecord(filmId, label).catch(() => null);
      if (!rec || rec.status !== 'review-required') continue;
      const onCamera = shot.metadata?.onCameraDialogue === true;
      const versions = await paidVersions(label) + 1;
      const planB = '';
      // Nunca se cambia la voz de un diálogo: tras 3 versiones pagadas sin mejorar, se detiene y avisa.
      if (versions >= 4 && !restoreList.includes(label)) { note(label, 'AGOTADA', `${r.puntuacion}/10 · ${versions - 1} versiones pagadas sin mejorar: se queda la actual (reparada si se pudo). Decide tú si se rehace.`); continue; }
      const revision = await latestPromptRevision(filmId, label).catch(() => null);
      const problems = gate ? gate.reasons.join('; ') : r.problemas.map((p) => `${p.tipo}: ${p.descripcion}`).join('; ') || r.motivo;
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

  console.log('\n=== LECCIONES ACTIVAS (se aplican solas a cada toma nueva) ===');
  const counts = await readCounts();
  for (const l of activeLessons(counts)) console.log(`  ✓ ${l.title}${l.fixed ? ' (del piloto)' : ` (vista ${counts[l.id]} veces)`}`);
  console.log('\n=== RESUMEN ===');
  for (const r of [...log.values()].sort((a, b) => a.label.localeCompare(b.label))) console.log(`  ${r.label.padEnd(8)} ${r.state.padEnd(12)} ${r.note}`);
  console.log(`  Gasto en video de este agente: ~US$${Math.max(0, spent).toFixed(2)}${budget ? ` de US$${budget.toFixed(2)}` : ''}. Siguiente: npm run montar -- ${key}`);
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
